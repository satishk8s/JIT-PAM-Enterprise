#!/usr/bin/env python3
from __future__ import annotations

import hmac
import json
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import boto3
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from database_manager import list_mysql_database_users
from vault_manager import VaultManager

app = FastAPI(title="NPAMX Vault DB Inventory Helper")

_SECRET_CACHE: dict[str, str] = {}


def _aws_region_for_runtime() -> str:
    return (
        str(os.getenv("AWS_REGION") or "").strip()
        or str(os.getenv("AWS_DEFAULT_REGION") or "").strip()
        or "ap-south-1"
    )


def _get_runtime_secret(secret_id: str) -> str:
    secret_name = str(secret_id or "").strip()
    if not secret_name:
        return ""
    cached = _SECRET_CACHE.get(secret_name)
    if cached is not None:
        return cached
    sm = boto3.client("secretsmanager", region_name=_aws_region_for_runtime())
    response = sm.get_secret_value(SecretId=secret_name) or {}
    secret_value = str(response.get("SecretString") or "").strip()
    if not secret_value:
        raise RuntimeError(f"Secrets Manager secret {secret_name} is empty")
    _SECRET_CACHE[secret_name] = secret_value
    return secret_value


def _plane_env_value(name: str, plane: str = "") -> str:
    norm = str(plane or "").strip().lower()
    candidates: list[str] = []
    if norm in ("nonprod", "non-prod", "non_prod", "dev", "staging", "test"):
        candidates.extend([f"{name}_NONPROD", f"{name}_NON_PROD", f"{name}_DEV"])
    elif norm in ("prod", "production"):
        candidates.extend([f"{name}_PROD", f"{name}_PRODUCTION"])
    elif norm == "sandbox":
        candidates.append(f"{name}_SANDBOX")
    candidates.append(name)
    for key in candidates:
        value = str(os.getenv(key) or "").strip()
        if value:
            return value
    return ""


def _plane_env_or_secret_value(name: str, plane: str = "") -> str:
    direct = _plane_env_value(name, plane)
    if direct:
        return direct
    norm = str(plane or "").strip().lower()
    candidates: list[str] = []
    if norm in ("nonprod", "non-prod", "non_prod", "dev", "staging", "test"):
        candidates.extend([f"{name}_SECRET_NAME_NONPROD", f"{name}_SECRET_NAME_NON_PROD", f"{name}_SECRET_NAME_DEV"])
    elif norm in ("prod", "production"):
        candidates.extend([f"{name}_SECRET_NAME_PROD", f"{name}_SECRET_NAME_PRODUCTION"])
    elif norm == "sandbox":
        candidates.append(f"{name}_SECRET_NAME_SANDBOX")
    candidates.append(f"{name}_SECRET_NAME")
    for key in candidates:
        secret_name = str(os.getenv(key) or "").strip()
        if secret_name:
            return _get_runtime_secret(secret_name)
    return ""


def _internal_token_for_plane(plane: str = "") -> str:
    return str(_plane_env_or_secret_value("VAULT_DB_HELPER_SHARED_TOKEN", plane) or "").strip()


async def _authorize_request(
    x_npamx_internal_token: str | None = Header(default=None, alias="X-NPAMX-Internal-Token"),
) -> str:
    token = str(x_npamx_internal_token or "").strip()
    expected = _internal_token_for_plane("") or _internal_token_for_plane("nonprod") or _internal_token_for_plane("prod")
    if not expected:
        raise HTTPException(status_code=500, detail="Vault DB helper shared token is not configured")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "ok"


def _is_mysql_family_engine(engine_name: str) -> bool:
    engine = str(engine_name or "").strip().lower()
    return any(token in engine for token in ("mysql", "maria", "aurora"))


def _infer_vault_connection_engine(plugin_name: str) -> str:
    plugin = str(plugin_name or "").strip().lower()
    if "redshift" in plugin:
        return "redshift"
    if "postgres" in plugin:
        return "postgresql"
    if "mysql" in plugin or "maria" in plugin:
        return "mysql"
    return plugin or "unknown"


def _extract_vault_connection_url(config: dict[str, Any]) -> str:
    if not isinstance(config, dict):
        return ""
    direct = str(config.get("connection_url") or "").strip()
    if direct:
        return direct
    details = config.get("connection_details")
    if isinstance(details, dict):
        for key in ("connection_url", "url", "dsn"):
            value = str(details.get(key) or "").strip()
            if value:
                return value
    return ""


def _extract_vault_connection_host_port(engine_name: str, connection_url: str) -> tuple[str, str]:
    engine = str(engine_name or "").strip().lower()
    raw = str(connection_url or "").strip()
    if not raw:
        return "", ""
    if _is_mysql_family_engine(engine):
        match = re.search(r"@tcp\((?P<host>[^)]+)\)", raw, flags=re.IGNORECASE)
        if match:
            host_port = str(match.group("host") or "").strip()
            if ":" in host_port:
                host, port = host_port.rsplit(":", 1)
                return host.strip(), port.strip() or "3306"
            return host_port, "3306"
        parsed = urlparse(raw if "://" in raw else f"mysql://{raw}")
        if parsed.hostname:
            return parsed.hostname, str(parsed.port or 3306)
        return "", ""
    parsed = urlparse(raw if "://" in raw else f"postgresql://{raw}")
    return str(parsed.hostname or "").strip(), str(parsed.port or (5439 if "redshift" in engine else 5432))


def _vault_db_user_origin_hint(username: str, *, connection_admin_username: str = "") -> str:
    user = str(username or "").strip().lower()
    admin_user = str(connection_admin_username or "").strip().lower()
    if not user:
        return "unknown"
    if user in {"mysql.sys", "mysql.session", "mysql.infoschema", "rdsadmin", "root"}:
        return "system"
    if admin_user and user == admin_user:
        return "vault_connection_admin"
    if user.startswith("d-") or user.startswith("dwh-"):
        return "vault_dynamic"
    return "manual_or_unknown"


def _connection_scan_one(connection_name: str, plane: str, tested_by: str) -> dict[str, Any]:
    card = {
        "connection_name": connection_name,
        "plane": plane,
        "status": "success",
        "code": "",
        "message": "",
        "engine": "",
        "plugin_name": "",
        "host": "",
        "port": "",
        "user_count": 0,
    }
    rows: list[dict[str, Any]] = []
    audit_session: dict[str, Any] | None = None
    revoke_error = ""
    cleanup_error = ""
    try:
        config = VaultManager.read_database_connection(connection_name, plane=plane)
        plugin_name = str(config.get("plugin_name") or "").strip()
        engine = _infer_vault_connection_engine(plugin_name)
        connection_url = _extract_vault_connection_url(config)
        host, port = _extract_vault_connection_host_port(engine, connection_url)
        details = config.get("connection_details") if isinstance(config.get("connection_details"), dict) else {}
        connection_admin_username = str(details.get("username") or "").strip()
        card.update({
            "engine": engine,
            "plugin_name": plugin_name,
            "host": host,
            "port": port,
        })
        if not _is_mysql_family_engine(engine):
            card.update({
                "status": "unsupported",
                "code": "NPAMX-VCONN-007",
                "message": "Visible in inventory, but live user inventory is not implemented for this engine yet.",
            })
            return {"card": card, "rows": rows, "supported": False, "unsupported": True, "error": False}
        if not host:
            raise RuntimeError("connection_url missing host")

        audit_session = VaultManager.create_or_read_database_user_audit_session(
            request_id=str(uuid.uuid4()),
            engine=engine,
            requester=tested_by or "npamx-helper",
            connection_name=connection_name,
            plane=plane,
        )
        probe = list_mysql_database_users(
            host=host,
            port=int(port or 3306),
            username=str(audit_session.get("db_username") or "").strip(),
            password=str(audit_session.get("vault_token") or "").strip(),
        )
        if not probe.get("success"):
            raise RuntimeError(str(probe.get("error") or "Database user inventory failed.").strip() or "Database user inventory failed.")

        users = probe.get("users") if isinstance(probe.get("users"), list) else []
        card["user_count"] = len(users)
        if str(audit_session.get("session_kind") or "").strip().lower() == "static":
            card["message"] = f"Retrieved {len(users)} user record(s) using the fixed NPAMX audit role."
        else:
            card["message"] = f"Retrieved {len(users)} user record(s) using a temporary Vault audit role."
        for item in users:
            username = str((item or {}).get("username") or "").strip()
            plugin = str((item or {}).get("plugin") or "").strip()
            host_value = str((item or {}).get("host") or "").strip()
            origin_hint = _vault_db_user_origin_hint(username, connection_admin_username=connection_admin_username)
            rows.append({
                "connection_name": connection_name,
                "engine": engine,
                "host": host,
                "port": str(port or "3306"),
                "username": username,
                "db_host": host_value,
                "plugin": plugin,
                "origin_hint": origin_hint,
                "vault_managed": origin_hint == "vault_dynamic",
            })
        return {"card": card, "rows": rows, "supported": True, "unsupported": False, "error": False}
    except Exception as exc:
        card.update({
            "status": "error",
            "code": "NPAMX-VCONN-005",
            "message": str(exc or "").strip() or "Database user inventory failed.",
        })
        return {"card": card, "rows": rows, "supported": False, "unsupported": False, "error": True}
    finally:
        if audit_session and str(audit_session.get("session_kind") or "dynamic").strip().lower() != "static":
            lease_id = str(audit_session.get("lease_id") or "").strip()
            role_name = str(audit_session.get("vault_role_name") or "").strip()
            if lease_id:
                try:
                    VaultManager.revoke_lease(lease_id, plane=plane)
                except Exception as exc:
                    revoke_error = str(exc or "").strip()
            if role_name:
                try:
                    VaultManager.delete_database_role(role_name, plane=plane)
                except Exception as exc:
                    cleanup_error = str(exc or "").strip()
            if (revoke_error or cleanup_error) and card.get("status") == "success":
                card.update({
                    "status": "warning",
                    "code": "NPAMX-VCONN-006",
                    "message": cleanup_error or revoke_error or "Temporary audit cleanup needs attention.",
                })


class AuditScanRequest(BaseModel):
    plane: str = Field(default="nonprod")
    connection_names: list[str] = Field(default_factory=list)
    tested_by: str = Field(default="")


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "vault-db-inventory-helper", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/internal/db-user-audit/scan")
def scan_database_users(payload: AuditScanRequest, _authorized: str = Depends(_authorize_request)):
    plane = str(payload.plane or "nonprod").strip() or "nonprod"
    requested = [str(item or "").strip() for item in (payload.connection_names or []) if str(item or "").strip()]
    connection_names = sorted(dict.fromkeys(requested)) if requested else sorted(VaultManager.list_database_connections(plane=plane) or [])
    if not connection_names:
        return {
            "status": "success",
            "plane": plane,
            "connections": [],
            "rows": [],
            "summary": {
                "selected_connections": 0,
                "processed_connections": 0,
                "supported_connections": 0,
                "unsupported_connections": 0,
                "error_connections": 0,
                "total_users": 0,
                "vault_dynamic_users": 0,
                "system_users": 0,
                "connection_admin_users": 0,
                "manual_or_unknown_users": 0,
            },
            "tested_by": str(payload.tested_by or "").strip(),
            "tested_at": datetime.now(timezone.utc).isoformat(),
        }

    max_workers = max(1, min(int(str(os.getenv("VAULT_DB_HELPER_MAX_WORKERS") or "8").strip() or "8"), max(1, len(connection_names))))
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(_connection_scan_one, name, plane, str(payload.tested_by or "").strip()): name
            for name in connection_names
        }
        for future in as_completed(future_map):
            results.append(future.result())

    cards = [item["card"] for item in results]
    rows: list[dict[str, Any]] = []
    for item in results:
        rows.extend(item.get("rows") or [])
    cards.sort(key=lambda item: str(item.get("connection_name") or "").lower())
    rows.sort(key=lambda item: ((item.get("connection_name") or "").lower(), (item.get("username") or "").lower(), (item.get("db_host") or "").lower()))

    return {
        "status": "success",
        "plane": plane,
        "connections": cards,
        "rows": rows,
        "summary": {
            "selected_connections": len(connection_names),
            "processed_connections": len(cards),
            "supported_connections": sum(1 for item in results if item.get("supported")),
            "unsupported_connections": sum(1 for item in results if item.get("unsupported")),
            "error_connections": sum(1 for item in results if item.get("error")),
            "total_users": len(rows),
            "vault_dynamic_users": sum(1 for item in rows if item.get("vault_managed")),
            "system_users": sum(1 for item in rows if item.get("origin_hint") == "system"),
            "connection_admin_users": sum(1 for item in rows if item.get("origin_hint") == "vault_connection_admin"),
            "manual_or_unknown_users": sum(1 for item in rows if item.get("origin_hint") == "manual_or_unknown"),
        },
        "tested_by": str(payload.tested_by or "").strip(),
        "tested_at": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("VAULT_DB_HELPER_HOST", "0.0.0.0"), port=int(os.getenv("VAULT_DB_HELPER_PORT", "8011")))
