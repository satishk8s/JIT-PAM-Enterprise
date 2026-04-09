#!/usr/bin/env python3
"""
Sync Vault database/config admin credentials from KV secrets.

Goal:
- DevOps updates DB admin username/password only in KV.
- This script copies those values into existing Vault database/config entries.

Usage:
  python3 sync-vault-db-config-from-kv.py \
    --mapping-file /etc/npamx/vault-db-admin-sync.json
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Tuple


def _vault_addr() -> str:
    addr = str(os.getenv("VAULT_ADDR") or "").strip()
    if not addr:
        raise RuntimeError("VAULT_ADDR is required")
    return addr.rstrip("/")


def _vault_token() -> str:
    token = str(os.getenv("VAULT_TOKEN") or "").strip()
    if token:
        return token
    # Optional fallback for Vault CLI login environments.
    token_file = os.path.expanduser("~/.vault-token")
    try:
        with open(token_file, "r", encoding="utf-8") as fh:
            return str(fh.read() or "").strip()
    except Exception:
        pass
    raise RuntimeError("VAULT_TOKEN (or ~/.vault-token) is required")


def _ssl_context() -> ssl.SSLContext:
    cacert = str(os.getenv("VAULT_CACERT") or "").strip()
    if cacert:
        ctx = ssl.create_default_context(cafile=cacert)
    else:
        ctx = ssl.create_default_context()
    skip_verify = str(os.getenv("VAULT_SKIP_VERIFY") or "").strip().lower() in ("1", "true", "yes")
    if skip_verify:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _vault_http(method: str, path: str, token: str, body: Dict[str, Any] | None = None) -> Dict[str, Any]:
    url = f"{_vault_addr()}/v1/{path.lstrip('/')}"
    payload = None
    headers = {"X-Vault-Token": token}
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url=url, data=payload, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20, context=_ssl_context()) as resp:
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = ""
        try:
            raw = exc.read().decode("utf-8", errors="replace")
        except Exception:
            raw = str(exc.reason or "")
        raise RuntimeError(f"Vault HTTP {exc.code} on {path}: {raw or exc.reason}") from exc


def _parse_secret_ref(ref: str, kv_version: int | None) -> Tuple[str, str, int]:
    cleaned = str(ref or "").strip().strip("/")
    if not cleaned:
        raise ValueError("secret_ref is required")
    parts = cleaned.split("/")
    if len(parts) < 2:
        raise ValueError(f"secret_ref must look like '<mount>/<path>', got: {ref}")
    mount = parts[0]
    rel = "/".join(parts[1:])
    if rel.startswith("data/"):
        rel = rel[5:]
    elif rel.startswith("metadata/"):
        rel = rel[9:]
    ver = 2 if kv_version is None else int(kv_version)
    if ver not in (1, 2):
        raise ValueError(f"Unsupported kv_version={ver} for {ref}; allowed: 1 or 2")
    return mount, rel, ver


def _read_kv_secret(token: str, secret_ref: str, kv_version: int | None) -> Dict[str, Any]:
    mount, rel, ver = _parse_secret_ref(secret_ref, kv_version)
    if ver == 2:
        path = f"{mount}/data/{rel}"
        data = (_vault_http("GET", path, token) or {}).get("data") or {}
        return data.get("data") or {}
    path = f"{mount}/{rel}"
    return (_vault_http("GET", path, token) or {}).get("data") or {}


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _build_write_payload(existing: Dict[str, Any], defaults: Dict[str, Any], username: str, password: str) -> Dict[str, Any]:
    conn_details = (existing.get("connection_details") if isinstance(existing.get("connection_details"), dict) else {}) or {}
    payload: Dict[str, Any] = {}

    plugin_name = str(existing.get("plugin_name") or defaults.get("plugin_name") or "").strip()
    if not plugin_name:
        raise ValueError("plugin_name is required (missing from existing config and defaults)")
    payload["plugin_name"] = plugin_name

    connection_url = str(conn_details.get("connection_url") or defaults.get("connection_url") or "").strip()
    if not connection_url:
        raise ValueError("connection_url is required (missing from existing config and defaults)")
    payload["connection_url"] = connection_url

    payload["username"] = username
    payload["password"] = password

    allowed_roles = existing.get("allowed_roles")
    if allowed_roles in (None, "", []):
        allowed_roles = defaults.get("allowed_roles", "*")
    payload["allowed_roles"] = allowed_roles

    username_template = str(conn_details.get("username_template") or defaults.get("username_template") or "").strip()
    if username_template:
        payload["username_template"] = username_template

    payload["max_open_connections"] = _as_int(
        conn_details.get("max_open_connections", defaults.get("max_open_connections", 4)),
        4,
    )
    payload["max_idle_connections"] = _as_int(
        conn_details.get("max_idle_connections", defaults.get("max_idle_connections", 0)),
        0,
    )
    payload["max_connection_lifetime"] = str(
        conn_details.get("max_connection_lifetime", defaults.get("max_connection_lifetime", "0s"))
    ).strip() or "0s"

    verify_existing = existing.get("verify_connection")
    if verify_existing is None:
        verify_existing = defaults.get("verify_connection", True)
    payload["verify_connection"] = bool(verify_existing)

    return payload


def _load_mapping(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        obj = json.load(fh)
    if not isinstance(obj, dict):
        raise ValueError("mapping file must be a JSON object")
    entries = obj.get("entries")
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        raise ValueError("'entries' must be a list when provided")
    obj["entries"] = entries
    auto = obj.get("auto_discovery")
    if auto is None:
        auto = {}
    if not isinstance(auto, dict):
        raise ValueError("'auto_discovery' must be an object when provided")
    obj["auto_discovery"] = auto
    if not entries and not bool(auto.get("enabled")):
        raise ValueError("mapping file needs either non-empty 'entries' or auto_discovery.enabled=true")
    return obj


def _is_missing_secret_error(exc: Exception) -> bool:
    msg = str(exc or "").strip().lower()
    return ("http 404" in msg) or ("no value found" in msg) or ("not found" in msg)


def _list_config_connections(token: str, db_mount: str) -> List[str]:
    path = f"{db_mount}/config?list=true"
    try:
        resp = _vault_http("GET", path, token)
    except Exception as exc:
        msg = str(exc or "").strip().lower()
        if "http 404" in msg:
            return []
        raise
    keys = (((resp or {}).get("data") or {}).get("keys") or [])
    out: List[str] = []
    for item in keys:
        name = str(item or "").strip().strip("/")
        if name:
            out.append(name)
    return sorted(set(out))


def _effective_entries(config: Dict[str, Any], token: str, db_mount: str) -> List[Dict[str, Any]]:
    entries = config.get("entries") or []
    by_conn: Dict[str, Dict[str, Any]] = {}
    for raw in entries:
        if not isinstance(raw, dict):
            continue
        conn = str(raw.get("connection_name") or "").strip()
        if not conn:
            continue
        by_conn[conn] = dict(raw)

    auto = config.get("auto_discovery") if isinstance(config.get("auto_discovery"), dict) else {}
    if auto and bool(auto.get("enabled")):
        secret_prefix = str(auto.get("secret_prefix") or "kv/npamx/db-admin/connections").strip().strip("/")
        kv_version = auto.get("kv_version", 2)
        create_if_missing = bool(auto.get("create_if_missing"))
        skip_missing_secret = bool(auto.get("skip_missing_secret", True))
        defaults = auto.get("defaults") if isinstance(auto.get("defaults"), dict) else {}
        for conn in _list_config_connections(token, db_mount):
            if conn in by_conn:
                continue
            by_conn[conn] = {
                "connection_name": conn,
                "secret_ref": f"{secret_prefix}/{conn}",
                "kv_version": kv_version,
                "create_if_missing": create_if_missing,
                "defaults": defaults,
                "_generated": True,
                "_skip_missing_secret": skip_missing_secret,
            }

    return [by_conn[key] for key in sorted(by_conn.keys())]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Vault database/config credentials from KV.")
    parser.add_argument(
        "--mapping-file",
        default="/etc/npamx/vault-db-admin-sync.json",
        help="JSON file with connection -> KV secret mappings",
    )
    parser.add_argument("--database-mount", default="database", help="Vault database mount path")
    parser.add_argument("--dry-run", action="store_true", help="Do not write updates")
    args = parser.parse_args()

    token = _vault_token()
    config = _load_mapping(args.mapping_file)
    db_mount = str(config.get("database_mount") or args.database_mount or "database").strip().strip("/") or "database"
    entries = _effective_entries(config, token, db_mount)

    total = 0
    updated = 0
    skipped = 0
    errors = 0

    for raw in entries:
        total += 1
        if not isinstance(raw, dict):
            print(f"[ERROR] entry#{total}: must be object")
            errors += 1
            continue

        conn = str(raw.get("connection_name") or "").strip()
        secret_ref = str(raw.get("secret_ref") or "").strip()
        kv_version = raw.get("kv_version")
        defaults = raw.get("defaults") if isinstance(raw.get("defaults"), dict) else {}
        create_if_missing = bool(raw.get("create_if_missing"))
        generated = bool(raw.get("_generated"))
        skip_missing_secret = bool(raw.get("_skip_missing_secret", False))

        if not conn or not secret_ref:
            print(f"[ERROR] entry#{total}: connection_name and secret_ref are required")
            errors += 1
            continue

        try:
            try:
                secret = _read_kv_secret(token, secret_ref, kv_version)
            except Exception as secret_exc:
                if generated and skip_missing_secret and _is_missing_secret_error(secret_exc):
                    print(f"[SKIP] {conn}: secret not found at {secret_ref}")
                    skipped += 1
                    continue
                raise
            username = str(secret.get("username") or "").strip()
            password = str(secret.get("password") or "").strip()
            if not username or not password:
                raise RuntimeError(f"{secret_ref} must contain non-empty username and password")

            existing = {}
            try:
                existing = (_vault_http("GET", f"{db_mount}/config/{conn}", token) or {}).get("data") or {}
            except Exception as exc:
                if create_if_missing:
                    existing = {}
                else:
                    raise RuntimeError(
                        f"connection {conn} not found or unreadable (set create_if_missing=true to create): {exc}"
                    ) from exc

            payload = _build_write_payload(existing, defaults, username=username, password=password)
            if args.dry_run:
                print(f"[DRY-RUN] {conn}: would sync from {secret_ref} using plugin={payload.get('plugin_name')}")
                skipped += 1
                continue

            _vault_http("POST", f"{db_mount}/config/{conn}", token, body=payload)
            print(f"[UPDATED] {conn}: synced admin creds from {secret_ref}")
            updated += 1
        except Exception as exc:
            print(f"[ERROR] {conn}: {exc}")
            errors += 1

    print(
        f"[SUMMARY] total={total} updated={updated} dry_run={bool(args.dry_run)} "
        f"skipped={skipped} errors={errors}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
