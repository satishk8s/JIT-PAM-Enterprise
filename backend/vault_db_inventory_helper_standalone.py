#!/usr/bin/env python3
from __future__ import annotations

import base64
import hmac
import json
import os
import re
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
import pymysql
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


class VaultHelper:
    _cached_tokens: dict[str, dict[str, Any]] = {}
    _cached_secret_values: dict[str, str] = {}
    _lock = threading.Lock()

    @staticmethod
    def _normalize_plane(plane: str) -> str:
        raw = str(plane or "").strip().lower()
        if raw in ("prod", "production"):
            return "prod"
        if raw in ("sandbox",):
            return "sandbox"
        if raw in ("nonprod", "non-prod", "non_prod", "dev", "staging", "test"):
            return "nonprod"
        return ""

    @staticmethod
    def _plane_env_keys(name: str, plane: str) -> list[str]:
        p = VaultHelper._normalize_plane(plane)
        if p == "prod":
            return [f"{name}_PROD", f"{name}_PRODUCTION"]
        if p == "sandbox":
            return [f"{name}_SANDBOX"]
        if p == "nonprod":
            return [f"{name}_NONPROD", f"{name}_NON_PROD", f"{name}_DEV"]
        return []

    @staticmethod
    def _env(name: str, plane: str = "") -> str:
        for key in VaultHelper._plane_env_keys(name, plane):
            value = str(os.getenv(key, "")).strip()
            if value:
                return value
        return str(os.getenv(name, "")).strip()

    @staticmethod
    def _aws_region(plane: str = "") -> str:
        return VaultHelper._env("AWS_REGION", plane) or VaultHelper._env("AWS_DEFAULT_REGION", plane) or "ap-south-1"

    @staticmethod
    def _get_secret_value(secret_name: str, plane: str = "") -> str:
        cache_key = f"{VaultHelper._normalize_plane(plane) or 'default'}::{secret_name}"
        with VaultHelper._lock:
            cached = VaultHelper._cached_secret_values.get(cache_key)
        if cached:
            return cached
        sm = boto3.client("secretsmanager", region_name=VaultHelper._aws_region(plane))
        resp = sm.get_secret_value(SecretId=secret_name)
        secret = str(resp.get("SecretString") or "").strip()
        if not secret:
            raise RuntimeError(f"Secrets Manager secret {secret_name} is empty")
        with VaultHelper._lock:
            VaultHelper._cached_secret_values[cache_key] = secret
        return secret

    @staticmethod
    def _env_or_secret(name: str, plane: str = "") -> str:
        direct = VaultHelper._env(name, plane)
        if direct:
            return direct
        secret_name = VaultHelper._env(f"{name}_SECRET_NAME", plane)
        if secret_name:
            return VaultHelper._get_secret_value(secret_name, plane)
        return ""

    @staticmethod
    def _vault_addr(plane: str = "") -> str:
        return str(VaultHelper._env("VAULT_ADDR", plane)).rstrip("/")

    @staticmethod
    def _vault_namespace(plane: str = "") -> str:
        return str(VaultHelper._env("VAULT_NAMESPACE", plane)).strip()

    @staticmethod
    def _vault_auth_method(plane: str = "") -> str:
        raw = str(VaultHelper._env("VAULT_AUTH_METHOD", plane) or "approle").strip().lower()
        return raw if raw in ("approle", "aws") else "approle"

    @staticmethod
    def _vault_aws_role(plane: str = "") -> str:
        return str(VaultHelper._env("VAULT_AWS_ROLE", plane)).strip()

    @staticmethod
    def _vault_aws_iam_server_id(plane: str = "") -> str:
        return str(VaultHelper._env("VAULT_AWS_IAM_SERVER_ID", plane)).strip()

    @staticmethod
    def _vault_aws_sts_region(plane: str = "") -> str:
        return str(VaultHelper._env("VAULT_AWS_IAM_REGION", plane)).strip() or "us-east-1"

    @staticmethod
    def _vault_aws_sts_endpoint(plane: str = "") -> str:
        explicit = str(VaultHelper._env("VAULT_AWS_IAM_STS_ENDPOINT", plane)).strip()
        if explicit:
            return explicit
        region = VaultHelper._vault_aws_sts_region(plane)
        return "https://sts.amazonaws.com/" if region == "us-east-1" else f"https://sts.{region}.amazonaws.com/"

    @staticmethod
    def _vault_ssl_context(plane: str = ""):
        if str(VaultHelper._env("VAULT_SKIP_VERIFY", plane)).strip().lower() in ("1", "true", "yes", "on"):
            return ssl._create_unverified_context()
        ca_path = (VaultHelper._env("VAULT_CACERT", plane) or VaultHelper._env("VAULT_CA_CERT", plane) or "").strip()
        if ca_path:
            return ssl.create_default_context(cafile=ca_path)
        return None

    @staticmethod
    def _cache_key_for_plane(plane: str = "") -> str:
        return VaultHelper._normalize_plane(plane) or "default"

    @staticmethod
    def _http_json(method: str, url: str, token: str | None, body: dict | None = None, timeout: int = 12, namespace: str | None = None, plane: str = "") -> dict:
        headers = {"Content-Type": "application/json"}
        ns = str(namespace if namespace is not None else VaultHelper._vault_namespace(plane)).strip()
        if ns:
            headers["X-Vault-Namespace"] = ns
        if token:
            headers["X-Vault-Token"] = token
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url=url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=VaultHelper._vault_ssl_context(plane)) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = ""
            try:
                raw = e.read().decode("utf-8")
            except Exception:
                pass
            raise RuntimeError(f"Vault HTTP {e.code}: {raw or e.reason}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Vault connection failed: {e}") from e

    @staticmethod
    def _vault_aws_login(addr: str, namespace: str, plane: str, role: str) -> dict:
        sts_region = VaultHelper._vault_aws_sts_region(plane)
        server_id = VaultHelper._vault_aws_iam_server_id(plane)
        session = boto3.Session(region_name=sts_region)
        creds = session.get_credentials()
        if creds is None:
            raise RuntimeError("Vault AWS auth could not find instance IAM credentials")
        frozen = creds.get_frozen_credentials()
        sts_endpoint = VaultHelper._vault_aws_sts_endpoint(plane)
        request_body = "Action=GetCallerIdentity&Version=2011-06-15"
        parsed = urllib.parse.urlparse(sts_endpoint)
        host_header = parsed.netloc or "sts.amazonaws.com"
        headers = {"Content-Type": "application/x-www-form-urlencoded; charset=utf-8", "Host": host_header}
        if server_id:
            headers["X-Vault-AWS-IAM-Server-ID"] = server_id
        request = AWSRequest(method="POST", url=sts_endpoint, data=request_body, headers=headers)
        SigV4Auth(frozen, "sts", sts_region).add_auth(request)
        signed_headers = dict(request.headers.items())
        payload = {
            "role": role,
            "iam_http_request_method": "POST",
            "iam_request_url": base64.b64encode(sts_endpoint.encode("utf-8")).decode("ascii"),
            "iam_request_body": base64.b64encode(request_body.encode("utf-8")).decode("ascii"),
            "iam_request_headers": base64.b64encode(json.dumps(signed_headers).encode("utf-8")).decode("ascii"),
        }
        return VaultHelper._http_json("POST", f"{addr}/v1/auth/aws/login", None, payload, namespace=namespace, plane=plane)

    @staticmethod
    def get_service_token(plane: str = "") -> str:
        now = time.time()
        cache_key = VaultHelper._cache_key_for_plane(plane)
        with VaultHelper._lock:
            cached = VaultHelper._cached_tokens.get(cache_key) or {}
        if cached.get("token") and now < float(cached.get("exp_epoch") or 0):
            return str(cached.get("token"))
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        auth_method = VaultHelper._vault_auth_method(plane)
        if auth_method == "aws":
            role = VaultHelper._vault_aws_role(plane)
            if not role:
                raise RuntimeError("Vault AWS auth not configured")
            resp = VaultHelper._vault_aws_login(addr, namespace, plane, role)
        else:
            role_id = VaultHelper._env_or_secret("VAULT_ROLE_ID", plane)
            secret_id = VaultHelper._env_or_secret("VAULT_SECRET_ID", plane)
            if not role_id or not secret_id:
                raise RuntimeError("Vault AppRole auth not configured")
            resp = VaultHelper._http_json("POST", f"{addr}/v1/auth/approle/login", None, {"role_id": role_id, "secret_id": secret_id}, namespace=namespace, plane=plane)
        auth = resp.get("auth") or {}
        token = str(auth.get("client_token") or "").strip()
        lease = int(auth.get("lease_duration") or 0)
        if not token:
            raise RuntimeError("Vault auth returned no client_token")
        with VaultHelper._lock:
            VaultHelper._cached_tokens[cache_key] = {"token": token, "exp_epoch": time.time() + max(30, lease - 30)}
        return token

    @staticmethod
    def list_database_connections(plane: str = "") -> list[str]:
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        mount = VaultHelper._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultHelper.get_service_token(plane)
        for method, url in [
            ("LIST", f"{addr}/v1/{mount}/config"),
            ("LIST", f"{addr}/v1/{mount}/config/"),
            ("GET", f"{addr}/v1/{mount}/config?list=true"),
            ("GET", f"{addr}/v1/{mount}/config/?list=true"),
        ]:
            try:
                response = VaultHelper._http_json(method, url, token, None, namespace=namespace, plane=plane)
                keys = ((response.get("data") or {}).get("keys") or []) if isinstance(response, dict) else []
                normalized = sorted([str(item or "").strip().rstrip("/") for item in keys if str(item or "").strip()])
                if normalized:
                    return normalized
            except Exception:
                continue
        return []

    @staticmethod
    def read_database_connection(connection_name: str, plane: str = "") -> dict:
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        mount = VaultHelper._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultHelper.get_service_token(plane)
        url = f"{addr}/v1/{mount}/config/{urllib.parse.quote(str(connection_name or '').strip(), safe='')}"
        response = VaultHelper._http_json("GET", url, token, None, namespace=namespace, plane=plane)
        return (response.get("data") or {}) if isinstance(response, dict) else {}

    @staticmethod
    def _short_request_fragment(request_id: str, length: int = 4) -> str:
        cleaned = re.sub(r"[^a-z0-9]", "", str(request_id or "").lower())
        frag = cleaned[: max(1, int(length or 4))]
        return frag or "req1"

    @staticmethod
    def _normalize_user_fragment(value: str, default: str = "user") -> str:
        text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
        return text or default

    @staticmethod
    def _role_name_for(requester: str, request_id: str, engine: str) -> str:
        eng = str(engine or "").lower()
        is_pg_family = ("postgres" in eng) or ("redshift" in eng)
        max_rendered_len = 63 if is_pg_family else 32
        prefix_len = 4 if "redshift" in eng else 2
        role_max = max_rendered_len - prefix_len
        rid_frag = VaultHelper._short_request_fragment(request_id, 4)
        user_frag = VaultHelper._normalize_user_fragment(requester).replace("_", "-")
        suffix = f"-{rid_frag}"
        user_max = max(3, role_max - len(suffix))
        base = f"{user_frag[:user_max].rstrip('-') or 'user'}{suffix}"
        return re.sub(r"[^a-zA-Z0-9_.-]+", "-", base)[:role_max].rstrip("-") or f"req-{rid_frag}"

    @staticmethod
    def _username_template_for(requester: str, request_id: str, engine: str) -> str:
        eng = str(engine or "").lower()
        rid_frag = VaultHelper._short_request_fragment(request_id, 4)
        user_frag = VaultHelper._normalize_user_fragment(requester, default="audit")
        if "redshift" in eng:
            budget = max(1, 63 - len("dwh--") - len(rid_frag))
            return f"dwh-{user_frag[:budget].rstrip('-') or 'audit'}-{rid_frag}"
        budget = max(1, 32 - len("d--") - len(rid_frag))
        return f"d-{user_frag[:budget].rstrip('-') or 'audit'}-{rid_frag}"

    @staticmethod
    def create_database_user_audit_session(request_id: str, engine: str, requester: str = "", connection_name: str = "", plane: str = "") -> dict:
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        mount = VaultHelper._env("VAULT_DB_MOUNT", plane) or "database"
        engine_l = str(engine or "").strip().lower()
        if not any(token in engine_l for token in ("mysql", "maria", "aurora")):
            raise RuntimeError("DB user inventory currently supports MySQL-family engines only.")
        role_name = VaultHelper._role_name_for(requester=requester, request_id=request_id, engine=engine_l)
        connection = str(connection_name or "").strip()
        creation_statements = [
            "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
            "GRANT SELECT, SHOW VIEW, PROCESS ON *.* TO '{{name}}'@'%';",
            "GRANT SELECT, SHOW VIEW ON `mysql`.* TO '{{name}}'@'%';",
        ]
        revocation_statements = ["DROP USER IF EXISTS '{{name}}'@'%';"]
        token = VaultHelper.get_service_token(plane)
        role_url = f"{addr}/v1/{mount}/roles/{role_name}"
        VaultHelper._http_json("POST", role_url, token, {
            "db_name": connection,
            "creation_statements": creation_statements,
            "revocation_statements": revocation_statements,
            "username_template": VaultHelper._username_template_for(requester=requester, request_id=request_id, engine=engine_l),
            "default_ttl": "15m",
            "max_ttl": "15m",
        }, namespace=namespace, plane=plane)
        creds = VaultHelper._http_json("GET", f"{addr}/v1/{mount}/creds/{role_name}", token, None, namespace=namespace, plane=plane)
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        lease_id = str(creds.get("lease_id") or "").strip()
        if not db_username or not db_password or not lease_id:
            raise RuntimeError("Vault did not return temporary DB audit credentials")
        return {
            "vault_role_name": role_name,
            "db_username": db_username,
            "vault_token": db_password,
            "lease_id": lease_id,
            "session_kind": "dynamic",
        }

    @staticmethod
    def revoke_lease(lease_id: str, plane: str = "") -> None:
        if not lease_id:
            return
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        token = VaultHelper.get_service_token(plane)
        VaultHelper._http_json("PUT", f"{addr}/v1/sys/leases/revoke", token, {"lease_id": lease_id}, namespace=namespace, plane=plane)

    @staticmethod
    def delete_database_role(role_name: str, plane: str = "") -> None:
        if not role_name:
            return
        addr = VaultHelper._vault_addr(plane)
        namespace = VaultHelper._vault_namespace(plane)
        mount = VaultHelper._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultHelper.get_service_token(plane)
        VaultHelper._http_json("DELETE", f"{addr}/v1/{mount}/roles/{urllib.parse.quote(role_name, safe='')}", token, None, namespace=namespace, plane=plane)


def _list_mysql_database_users(host: str, port: int, username: str, password: str):
    kwargs = {
        "host": host,
        "port": int(port or 3306),
        "user": username,
        "password": password,
        "database": "mysql",
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 10,
        "read_timeout": 30,
        "write_timeout": 30,
    }
    conn = pymysql.connect(**kwargs)
    cursor = conn.cursor()
    rows = []
    queries = [
        "SELECT user AS username, host, plugin FROM mysql.user ORDER BY user, host",
        (
            "SELECT SUBSTRING_INDEX(REPLACE(grantee, \"'\", ''), '@', 1) AS username, "
            "SUBSTRING_INDEX(REPLACE(grantee, \"'\", ''), '@', -1) AS host, "
            "'' AS plugin "
            "FROM information_schema.user_privileges "
            "GROUP BY grantee ORDER BY username, host"
        ),
    ]
    last_error = None
    for query in queries:
        try:
            cursor.execute(query)
            rows = cursor.fetchall() or []
            if rows:
                break
        except Exception as exc:
            last_error = exc
            continue
    cursor.close()
    conn.close()
    if not rows and last_error:
        raise last_error
    users = []
    seen = set()
    for row in rows:
        normalized = (
            str(row.get("username") or "").strip(),
            str(row.get("host") or "").strip(),
            str(row.get("plugin") or "").strip(),
        )
        if normalized in seen:
            continue
        seen.add(normalized)
        users.append({"username": normalized[0], "host": normalized[1], "plugin": normalized[2]})
    return users


def _infer_engine(plugin_name: str) -> str:
    plugin = str(plugin_name or "").strip().lower()
    if "redshift" in plugin:
        return "redshift"
    if "postgres" in plugin:
        return "postgresql"
    if "mysql" in plugin or "maria" in plugin:
        return "mysql"
    return plugin or "unknown"


def _extract_connection_url(config: dict[str, Any]) -> str:
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


def _extract_host_port(engine_name: str, connection_url: str) -> tuple[str, str]:
    engine = str(engine_name or "").strip().lower()
    raw = str(connection_url or "").strip()
    if not raw:
        return "", ""
    if any(token in engine for token in ("mysql", "maria", "aurora")):
        match = re.search(r"@tcp\((?P<host>[^)]+)\)", raw, flags=re.IGNORECASE)
        if match:
            host_port = str(match.group("host") or "").strip()
            if ":" in host_port:
                host, port = host_port.rsplit(":", 1)
                return host.strip(), port.strip() or "3306"
            return host_port, "3306"
    return "", ""


def _origin_hint(username: str, connection_admin_username: str = "") -> str:
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


def _scan_connection(connection_name: str, plane: str, tested_by: str) -> dict[str, Any]:
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
    audit_session = None
    try:
        config = VaultHelper.read_database_connection(connection_name, plane=plane)
        plugin_name = str(config.get("plugin_name") or "").strip()
        engine = _infer_engine(plugin_name)
        connection_url = _extract_connection_url(config)
        host, port = _extract_host_port(engine, connection_url)
        details = config.get("connection_details") if isinstance(config.get("connection_details"), dict) else {}
        connection_admin_username = str(details.get("username") or "").strip()
        card.update({"engine": engine, "plugin_name": plugin_name, "host": host, "port": port})
        if not any(token in engine for token in ("mysql", "maria", "aurora")):
            card.update({"status": "unsupported", "code": "NPAMX-VCONN-007", "message": "Visible in inventory, but live user inventory is not implemented for this engine yet."})
            return {"card": card, "rows": rows, "supported": False, "unsupported": True, "error": False}
        if not host:
            raise RuntimeError("connection_url missing host")
        audit_session = VaultHelper.create_database_user_audit_session(
            request_id=str(uuid.uuid4()),
            engine=engine,
            requester=tested_by or "npamx-helper",
            connection_name=connection_name,
            plane=plane,
        )
        users = _list_mysql_database_users(
            host=host,
            port=int(port or 3306),
            username=str(audit_session.get("db_username") or "").strip(),
            password=str(audit_session.get("vault_token") or "").strip(),
        )
        card["user_count"] = len(users)
        card["message"] = f"Retrieved {len(users)} user record(s) using a temporary Vault audit role."
        for item in users:
            username = str((item or {}).get("username") or "").strip()
            plugin = str((item or {}).get("plugin") or "").strip()
            host_value = str((item or {}).get("host") or "").strip()
            hint = _origin_hint(username, connection_admin_username)
            rows.append({
                "connection_name": connection_name,
                "engine": engine,
                "host": host,
                "port": str(port or "3306"),
                "username": username,
                "db_host": host_value,
                "plugin": plugin,
                "origin_hint": hint,
                "vault_managed": hint == "vault_dynamic",
            })
        return {"card": card, "rows": rows, "supported": True, "unsupported": False, "error": False}
    except Exception as exc:
        card.update({"status": "error", "code": "NPAMX-VCONN-005", "message": str(exc or "").strip() or "Database user inventory failed."})
        return {"card": card, "rows": rows, "supported": False, "unsupported": False, "error": True}
    finally:
        if audit_session:
            lease_id = str(audit_session.get("lease_id") or "").strip()
            role_name = str(audit_session.get("vault_role_name") or "").strip()
            try:
                if lease_id:
                    VaultHelper.revoke_lease(lease_id, plane=plane)
            except Exception:
                pass
            try:
                if role_name:
                    VaultHelper.delete_database_role(role_name, plane=plane)
            except Exception:
                pass


def _shared_token() -> str:
    return str(VaultHelper._env_or_secret("VAULT_DB_HELPER_SHARED_TOKEN") or "").strip()


async def _authorize(x_npamx_internal_token: str | None = Header(default=None, alias="X-NPAMX-Internal-Token")) -> str:
    expected = _shared_token()
    token = str(x_npamx_internal_token or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="VAULT_DB_HELPER_SHARED_TOKEN is not configured")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "ok"


class AuditScanRequest(BaseModel):
    plane: str = Field(default="nonprod")
    connection_names: list[str] = Field(default_factory=list)
    tested_by: str = Field(default="")


app = FastAPI(title="NPAMX Vault DB Inventory Helper")


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "vault-db-inventory-helper", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/internal/db-user-audit/scan")
def scan_database_users(payload: AuditScanRequest, _auth: str = Depends(_authorize)):
    plane = str(payload.plane or "nonprod").strip() or "nonprod"
    requested = [str(item or "").strip() for item in (payload.connection_names or []) if str(item or "").strip()]
    connection_names = sorted(dict.fromkeys(requested)) if requested else sorted(VaultHelper.list_database_connections(plane=plane) or [])
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
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(_scan_connection, name, plane, str(payload.tested_by or "").strip()): name for name in connection_names}
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
