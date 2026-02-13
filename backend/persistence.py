"""
SQLite persistence for NPAMX
============================

This replaces the old JSON file storage for requests/approvals and provides
tables for:
- requests
- db_sessions
- approvals
- audit_logs

Design goals (pragmatic):
- Keep the existing in-memory `requests_db` / `approvals_db` contract in
  backend/app.py to avoid a risky refactor of a large Flask app.
- Persist on each `_save_requests()` call (sync from memory to SQLite).
- Provide migration from legacy requests.json if present (one-time).
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime


def _utcnow_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


class NpamxStore:
    def __init__(self, db_path: str):
        self.db_path = str(db_path or "").strip()
        if not self.db_path:
            raise ValueError("db_path is required")
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS requests (
                    request_id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    user_email TEXT,
                    account_id TEXT,
                    db_instance_id TEXT,
                    db_name TEXT,
                    engine TEXT,
                    status TEXT,
                    created_at TEXT,
                    modified_at TEXT,
                    expires_at TEXT,
                    payload_json TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(type);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_email);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_requests_db ON requests(db_instance_id, db_name);")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS db_sessions (
                    request_id TEXT PRIMARY KEY,
                    vault_role_name TEXT,
                    lease_id TEXT,
                    db_username TEXT,
                    password TEXT,
                    auth_type TEXT,
                    expires_at TEXT,
                    created_at TEXT,
                    payload_json TEXT,
                    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_db_sessions_expires ON db_sessions(expires_at);")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS approvals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    approver_role TEXT,
                    approver_email TEXT,
                    approved_at TEXT,
                    payload_json TEXT,
                    FOREIGN KEY (request_id) REFERENCES requests(request_id) ON DELETE CASCADE
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_approvals_request ON approvals(request_id);")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    user_email TEXT,
                    request_id TEXT,
                    role TEXT,
                    action TEXT,
                    allowed INTEGER,
                    rows_returned INTEGER,
                    error TEXT,
                    query TEXT,
                    payload_json TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);")

    def is_empty(self) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(1) AS c FROM requests").fetchone()
            return int(row["c"] or 0) == 0

    def load_all(self) -> tuple[dict, dict]:
        """Return (requests_db, approvals_db) matching the legacy in-memory shapes."""
        requests_db: dict = {}
        approvals_db: dict = {}
        with self._connect() as conn:
            for row in conn.execute("SELECT request_id, payload_json FROM requests"):
                rid = str(row["request_id"])
                try:
                    payload = json.loads(row["payload_json"] or "{}")
                except Exception:
                    payload = {}
                if isinstance(payload, dict):
                    requests_db[rid] = payload

            # approvals_db shape: { request_id: [ {approver_role, approved_at, ...}, ... ] }
            for row in conn.execute(
                "SELECT request_id, approver_role, approver_email, approved_at, payload_json FROM approvals ORDER BY id ASC"
            ):
                rid = str(row["request_id"])
                approvals_db.setdefault(rid, [])
                entry = {
                    "approver_role": row["approver_role"],
                    "approved_at": row["approved_at"],
                }
                if row["approver_email"]:
                    entry["approver_email"] = row["approver_email"]
                try:
                    extra = json.loads(row["payload_json"] or "{}")
                    if isinstance(extra, dict):
                        entry.update(extra)
                except Exception:
                    pass
                approvals_db[rid].append(entry)

        return requests_db, approvals_db

    def sync_from_memory(self, requests_db: dict, approvals_db: dict) -> None:
        """
        Persist the current in-memory dictionaries to SQLite.

        This is intentionally simple (full sync) to avoid missing edge cases while
        the codebase is refactored.
        """
        reqs = requests_db or {}
        appr = approvals_db or {}

        with self._connect() as conn:
            conn.execute("BEGIN;")
            try:
                # Upsert requests
                for rid, req in reqs.items():
                    if not isinstance(req, dict):
                        continue
                    payload_json = json.dumps(req, separators=(",", ":"), ensure_ascii=True)
                    rtype = str(req.get("type") or "")
                    user_email = str(req.get("user_email") or "")
                    account_id = str(req.get("account_id") or "")
                    status = str(req.get("status") or "")
                    created_at = str(req.get("created_at") or "")
                    modified_at = str(req.get("modified_at") or "")
                    expires_at = str(req.get("expires_at") or "")

                    db_instance_id = ""
                    db_name = ""
                    engine = ""
                    if rtype == "database_access":
                        db_instance_id = str(req.get("db_instance_id") or "")
                        engine = str((req.get("engine") or "") or "")
                        # store first DB name for search/filter; full list remains in payload_json
                        try:
                            dbs = req.get("databases") or []
                            if isinstance(dbs, list) and dbs and isinstance(dbs[0], dict):
                                db_name = str(dbs[0].get("name") or "")
                                engine = engine or str(dbs[0].get("engine") or "")
                        except Exception:
                            pass

                    conn.execute(
                        """
                        INSERT INTO requests (
                            request_id, type, user_email, account_id, db_instance_id, db_name, engine,
                            status, created_at, modified_at, expires_at, payload_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(request_id) DO UPDATE SET
                            type=excluded.type,
                            user_email=excluded.user_email,
                            account_id=excluded.account_id,
                            db_instance_id=excluded.db_instance_id,
                            db_name=excluded.db_name,
                            engine=excluded.engine,
                            status=excluded.status,
                            created_at=excluded.created_at,
                            modified_at=excluded.modified_at,
                            expires_at=excluded.expires_at,
                            payload_json=excluded.payload_json;
                        """,
                        (
                            str(rid),
                            rtype,
                            user_email,
                            account_id,
                            db_instance_id,
                            db_name,
                            engine,
                            status,
                            created_at,
                            modified_at,
                            expires_at,
                            payload_json,
                        ),
                    )

                    # Keep db_sessions in sync for database_access requests.
                    if rtype == "database_access":
                        auth_type = str(req.get("effective_auth") or "password").strip().lower() or "password"
                        vault_role_name = str(req.get("vault_role_name") or req.get("role_name") or "")
                        lease_id = str(req.get("vault_lease_id") or req.get("lease_id") or "")
                        db_username = str(req.get("db_username") or "")
                        password = str(req.get("password") or req.get("vault_token") or "")

                        # For IAM, do not persist an IAM token (it should be generated on demand).
                        if auth_type == "iam":
                            password = ""

                        conn.execute(
                            """
                            INSERT INTO db_sessions (
                                request_id, vault_role_name, lease_id, db_username, password, auth_type, expires_at, created_at, payload_json
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(request_id) DO UPDATE SET
                                vault_role_name=excluded.vault_role_name,
                                lease_id=excluded.lease_id,
                                db_username=excluded.db_username,
                                password=excluded.password,
                                auth_type=excluded.auth_type,
                                expires_at=excluded.expires_at;
                            """,
                            (
                                str(rid),
                                vault_role_name,
                                lease_id,
                                db_username,
                                password,
                                auth_type,
                                expires_at,
                                req.get("activated_at") or req.get("approved_at") or req.get("created_at") or _utcnow_iso(),
                                json.dumps(
                                    {
                                        "proxy_host": req.get("proxy_host"),
                                        "proxy_port": req.get("proxy_port"),
                                    },
                                    separators=(",", ":"),
                                    ensure_ascii=True,
                                ),
                            ),
                        )

                # Approvals: simplest approach is to rebuild all rows from approvals_db.
                conn.execute("DELETE FROM approvals;")
                for rid, entries in (appr or {}).items():
                    if not isinstance(entries, list):
                        continue
                    for entry in entries:
                        if not isinstance(entry, dict):
                            continue
                        conn.execute(
                            "INSERT INTO approvals (request_id, approver_role, approver_email, approved_at, payload_json) VALUES (?, ?, ?, ?, ?);",
                            (
                                str(rid),
                                str(entry.get("approver_role") or ""),
                                str(entry.get("approver_email") or ""),
                                str(entry.get("approved_at") or ""),
                                json.dumps(entry, separators=(",", ":"), ensure_ascii=True),
                            ),
                        )

                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise

    def import_legacy_requests_json(self, json_path: str) -> tuple[int, int]:
        """
        One-time migration helper for legacy backend/data/requests.json.
        Returns (requests_count, approvals_count).
        """
        path = str(json_path or "").strip()
        if not path or not os.path.exists(path):
            return (0, 0)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
        except Exception:
            return (0, 0)

        reqs = data.get("requests") or {}
        appr = data.get("approvals") or {}
        if not isinstance(reqs, dict) or not isinstance(appr, dict):
            return (0, 0)

        self.sync_from_memory(reqs, appr)
        return (len(reqs), sum(len(v or []) for v in appr.values() if isinstance(v, list)))

    def insert_audit_log(
        self,
        *,
        ts: str | None,
        user_email: str,
        request_id: str,
        role: str,
        action: str,
        allowed: bool,
        rows_returned: int | None = None,
        error: str | None = None,
        query: str | None = None,
        payload: dict | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (ts, user_email, request_id, role, action, allowed, rows_returned, error, query, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    ts or _utcnow_iso(),
                    str(user_email or ""),
                    str(request_id or ""),
                    str(role or ""),
                    str(action or ""),
                    1 if allowed else 0,
                    int(rows_returned) if rows_returned is not None else None,
                    str(error or ""),
                    str(query or ""),
                    json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=True),
                ),
            )
