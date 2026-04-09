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


_REQUEST_SECRET_FIELDS = ("password", "vault_token", "db_password")


def _utcnow_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _sanitize_request_payload(req: dict) -> dict:
    payload = dict(req or {})
    for field in _REQUEST_SECRET_FIELDS:
        if field in payload:
            payload[field] = ""
    return payload


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

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS request_tickets (
                    request_id TEXT PRIMARY KEY,
                    ticket_category TEXT,
                    request_type TEXT,
                    raised_by_email TEXT,
                    beneficiary_email TEXT,
                    account_id TEXT,
                    resource_target TEXT,
                    requested_actions TEXT,
                    request_reason TEXT,
                    request_status TEXT,
                    approval_workflow_name TEXT,
                    approver_emails TEXT,
                    approved_by TEXT,
                    declined_by TEXT,
                    decline_reason TEXT,
                    requested_at TEXT,
                    decision_at TEXT,
                    expires_at TEXT,
                    deleted_at TEXT,
                    deleted_by TEXT,
                    payload_json TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_tickets_category ON request_tickets(ticket_category);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_tickets_status ON request_tickets(request_status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_tickets_requested_at ON request_tickets(requested_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_tickets_beneficiary ON request_tickets(beneficiary_email);")

    def _delete_rows_not_in(self, conn: sqlite3.Connection, table: str, current_ids: set[str]) -> None:
        existing_ids = {
            str(row["request_id"])
            for row in conn.execute(f"SELECT request_id FROM {table}")
        }
        stale_ids = sorted(existing_ids - set(current_ids or set()))
        for request_id in stale_ids:
            conn.execute(f"DELETE FROM {table} WHERE request_id = ?;", (request_id,))

    def _request_ticket_record(self, request_id: str, req: dict, approvals: list | None = None) -> dict:
        request_payload = _sanitize_request_payload(req)
        request_type = str(request_payload.get("type") or "").strip().lower()
        beneficiary_email = str(request_payload.get("user_email") or "").strip().lower()
        raised_by_email = str(request_payload.get("requested_by") or beneficiary_email).strip().lower()
        account_id = str(request_payload.get("account_id") or "").strip()
        workflow_name = str(request_payload.get("approval_workflow_name") or "").strip()
        status = str(request_payload.get("status") or "").strip().lower()
        requested_at = str(
            request_payload.get("created_at")
            or request_payload.get("requested_at")
            or request_payload.get("modified_at")
            or ""
        ).strip()
        expires_at = str(request_payload.get("expires_at") or "").strip()
        deleted_at = str(request_payload.get("deleted_at") or "").strip()
        deleted_by = str(request_payload.get("deleted_by") or "").strip().lower()
        decline_reason = str(
            request_payload.get("denial_reason")
            or request_payload.get("decline_reason")
            or request_payload.get("rejection_reason")
            or ""
        ).strip()
        declined_by = str(
            request_payload.get("denied_by")
            or request_payload.get("declined_by")
            or ""
        ).strip().lower()

        category = "cloud"
        if request_type == "database_access":
            category = "databases"
        elif request_type == "instance_access":
            category = "workloads"
        elif request_type in ("storage_access", "s3_access", "gcs_access"):
            category = "storage"

        resource_target = ""
        if request_type == "database_access":
            db_name = str(request_payload.get("requested_database_name") or "").strip()
            schema_name = str(request_payload.get("requested_schema_name") or "").strip()
            table_name = str(request_payload.get("requested_table_name") or "").strip()
            instance_name = str(
                request_payload.get("requested_instance_input")
                or request_payload.get("db_instance_id")
                or request_payload.get("db_resource_id")
                or ""
            ).strip()
            resource_parts = [part for part in (instance_name, db_name, schema_name, table_name) if part]
            resource_target = " / ".join(resource_parts)
        elif request_type == "instance_access":
            usernames = [str(item.get("id") or "").strip() for item in (request_payload.get("instances") or []) if isinstance(item, dict)]
            resource_target = ", ".join([item for item in usernames if item])
        else:
            resource_target = str(
                request_payload.get("resource_name")
                or request_payload.get("target")
                or request_payload.get("permission_set_name")
                or account_id
                or request_id
            ).strip()

        requested_actions = ""
        if request_type == "database_access":
            actions = request_payload.get("query_types") or request_payload.get("permissions") or []
            if isinstance(actions, list):
                requested_actions = ", ".join([str(item).strip() for item in actions if str(item).strip()])
            else:
                requested_actions = str(actions or request_payload.get("requested_access_type") or "").strip()
        elif isinstance(request_payload.get("permissions"), list):
            requested_actions = ", ".join([str(item).strip() for item in (request_payload.get("permissions") or []) if str(item).strip()])
        else:
            requested_actions = str(
                request_payload.get("permission_set_name")
                or request_payload.get("permission_set")
                or request_payload.get("use_case")
                or ""
            ).strip()

        approval_entries = approvals if isinstance(approvals, list) else []
        approver_values = []
        approved_by_values = []
        decision_times = []
        for entry in approval_entries:
            if not isinstance(entry, dict):
                continue
            approver_email = str(entry.get("approver_email") or "").strip().lower()
            approver_role = str(entry.get("approver_role") or "").strip()
            approved_at = str(entry.get("approved_at") or "").strip()
            label = approver_email or approver_role
            if label and label not in approver_values:
                approver_values.append(label)
            if approved_at and label and label not in approved_by_values:
                approved_by_values.append(label)
            if approved_at:
                decision_times.append(approved_at)
        for extra_email in (
            str(request_payload.get("request_approver_email") or "").strip().lower(),
            str(request_payload.get("security_lead_email") or "").strip().lower(),
        ):
            if extra_email and extra_email not in approver_values:
                approver_values.append(extra_email)

        decision_at = ""
        for value in (
            request_payload.get("approved_at"),
            request_payload.get("denied_at"),
            request_payload.get("revoked_at"),
            request_payload.get("completed_at"),
            request_payload.get("expired_at"),
        ):
            raw = str(value or "").strip()
            if raw:
                decision_at = raw
                break
        if not decision_at and decision_times:
            decision_at = sorted(decision_times)[-1]

        return {
            "request_id": str(request_id or "").strip(),
            "ticket_category": category,
            "request_type": request_type,
            "raised_by_email": raised_by_email,
            "beneficiary_email": beneficiary_email,
            "account_id": account_id,
            "resource_target": resource_target,
            "requested_actions": requested_actions,
            "request_reason": str(request_payload.get("justification") or "").strip(),
            "request_status": status,
            "approval_workflow_name": workflow_name,
            "approver_emails": ", ".join(approver_values),
            "approved_by": ", ".join(approved_by_values),
            "declined_by": declined_by,
            "decline_reason": decline_reason,
            "requested_at": requested_at,
            "decision_at": decision_at,
            "expires_at": expires_at,
            "deleted_at": deleted_at,
            "deleted_by": deleted_by,
            "payload_json": json.dumps(request_payload, separators=(",", ":"), ensure_ascii=True),
        }

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
                current_request_ids = {
                    str(rid) for rid, req in reqs.items()
                    if isinstance(req, dict)
                }
                current_db_request_ids = {
                    str(rid) for rid, req in reqs.items()
                    if isinstance(req, dict) and str(req.get("type") or "") == "database_access"
                }

                self._delete_rows_not_in(conn, "requests", current_request_ids)
                self._delete_rows_not_in(conn, "db_sessions", current_db_request_ids)

                # Upsert requests
                for rid, req in reqs.items():
                    if not isinstance(req, dict):
                        continue
                    sanitized_req = _sanitize_request_payload(req)
                    payload_json = json.dumps(sanitized_req, separators=(",", ":"), ensure_ascii=True)
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
                                "",
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

                self.sync_request_tickets(reqs, appr, conn=conn)

                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise

    def persist_single_request(self, request_id: str, req: dict, *, remove_db_session: bool = False) -> None:
        """Persist one request payload directly, optionally removing its db_session row."""
        rid = str(request_id or "").strip()
        if not rid:
            raise ValueError("request_id is required")
        if not isinstance(req, dict):
            raise ValueError("req must be a dict")

        payload_json = json.dumps(_sanitize_request_payload(req), separators=(",", ":"), ensure_ascii=True)
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
            try:
                dbs = req.get("databases") or []
                if isinstance(dbs, list) and dbs and isinstance(dbs[0], dict):
                    db_name = str(dbs[0].get("name") or "")
                    engine = engine or str(dbs[0].get("engine") or "")
            except Exception:
                pass

        with self._connect() as conn:
            conn.execute("BEGIN;")
            try:
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
                        rid,
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
                if remove_db_session:
                    conn.execute("DELETE FROM db_sessions WHERE request_id = ?;", (rid,))
                self.upsert_request_ticket(rid, req, conn=conn)
                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise

    def mark_database_request_revoked(self, request_id: str, *, revoked_at: str, reason: str = '', warning: str = '') -> None:
        """Mark one DB request revoked and remove any persisted db_session row."""
        rid = str(request_id or '').strip()
        if not rid:
            raise ValueError("request_id is required")
        revoked_ts = str(revoked_at or '').strip() or _utcnow_iso()
        revoke_reason = str(reason or '').strip()
        revoke_warning = str(warning or '').strip()

        with self._connect() as conn:
            conn.execute("BEGIN;")
            try:
                conn.execute(
                    """
                    UPDATE requests
                    SET status = ?,
                        modified_at = ?,
                        payload_json = json_set(
                            COALESCE(payload_json, '{}'),
                            '$.status', ?,
                            '$.revoked_at', ?,
                            '$.revoke_reason', ?,
                            '$.revocation_warning', ?,
                            '$.vault_token', '',
                            '$.password', '',
                            '$.db_password', ''
                        )
                    WHERE request_id = ?;
                    """,
                    (
                        "revoked",
                        revoked_ts,
                        "revoked",
                        revoked_ts,
                        revoke_reason,
                        revoke_warning,
                        rid,
                    ),
                )
                conn.execute("DELETE FROM db_sessions WHERE request_id = ?;", (rid,))
                row = conn.execute("SELECT payload_json FROM requests WHERE request_id = ?;", (rid,)).fetchone()
                payload = {}
                try:
                    payload = json.loads((row["payload_json"] if row else "") or "{}")
                except Exception:
                    payload = {}
                self.upsert_request_ticket(rid, payload, conn=conn)
                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise

    def upsert_request_ticket(self, request_id: str, req: dict, approvals: list | None = None, *, conn: sqlite3.Connection | None = None) -> None:
        rid = str(request_id or "").strip()
        if not rid or not isinstance(req, dict):
            return
        row = self._request_ticket_record(rid, req, approvals)
        owns_conn = conn is None
        connection = conn or self._connect()
        try:
            connection.execute(
                """
                INSERT INTO request_tickets (
                    request_id, ticket_category, request_type, raised_by_email, beneficiary_email,
                    account_id, resource_target, requested_actions, request_reason, request_status,
                    approval_workflow_name, approver_emails, approved_by, declined_by, decline_reason,
                    requested_at, decision_at, expires_at, deleted_at, deleted_by, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(request_id) DO UPDATE SET
                    ticket_category=excluded.ticket_category,
                    request_type=excluded.request_type,
                    raised_by_email=excluded.raised_by_email,
                    beneficiary_email=excluded.beneficiary_email,
                    account_id=excluded.account_id,
                    resource_target=excluded.resource_target,
                    requested_actions=excluded.requested_actions,
                    request_reason=excluded.request_reason,
                    request_status=excluded.request_status,
                    approval_workflow_name=excluded.approval_workflow_name,
                    approver_emails=excluded.approver_emails,
                    approved_by=excluded.approved_by,
                    declined_by=excluded.declined_by,
                    decline_reason=excluded.decline_reason,
                    requested_at=excluded.requested_at,
                    decision_at=excluded.decision_at,
                    expires_at=excluded.expires_at,
                    deleted_at=excluded.deleted_at,
                    deleted_by=excluded.deleted_by,
                    payload_json=excluded.payload_json;
                """,
                (
                    row["request_id"],
                    row["ticket_category"],
                    row["request_type"],
                    row["raised_by_email"],
                    row["beneficiary_email"],
                    row["account_id"],
                    row["resource_target"],
                    row["requested_actions"],
                    row["request_reason"],
                    row["request_status"],
                    row["approval_workflow_name"],
                    row["approver_emails"],
                    row["approved_by"],
                    row["declined_by"],
                    row["decline_reason"],
                    row["requested_at"],
                    row["decision_at"],
                    row["expires_at"],
                    row["deleted_at"],
                    row["deleted_by"],
                    row["payload_json"],
                ),
            )
        finally:
            if owns_conn:
                connection.close()

    def sync_request_tickets(self, requests_db: dict, approvals_db: dict, *, conn: sqlite3.Connection | None = None) -> None:
        reqs = requests_db or {}
        appr = approvals_db or {}
        owns_conn = conn is None
        connection = conn or self._connect()
        try:
            for rid, req in reqs.items():
                if not isinstance(req, dict):
                    continue
                self.upsert_request_ticket(str(rid), req, approvals=appr.get(rid), conn=connection)
        finally:
            if owns_conn:
                connection.close()

    def mark_request_ticket_deleted(self, request_id: str, *, deleted_by: str = '', deleted_at: str | None = None, reason: str = '') -> None:
        rid = str(request_id or '').strip()
        if not rid:
            return
        deleted_ts = str(deleted_at or '').strip() or _utcnow_iso()
        actor = str(deleted_by or '').strip().lower()
        with self._connect() as conn:
            conn.execute("BEGIN;")
            try:
                row = conn.execute("SELECT payload_json FROM request_tickets WHERE request_id = ?;", (rid,)).fetchone()
                payload = {}
                try:
                    payload = json.loads((row["payload_json"] if row else "") or "{}")
                except Exception:
                    payload = {}
                if not isinstance(payload, dict):
                    payload = {}
                payload["deleted_at"] = deleted_ts
                payload["deleted_by"] = actor
                if reason:
                    payload["ticket_delete_reason"] = str(reason or '').strip()
                conn.execute(
                    """
                    UPDATE request_tickets
                    SET deleted_at = ?, deleted_by = ?, payload_json = ?
                    WHERE request_id = ?;
                    """,
                    (
                        deleted_ts,
                        actor,
                        json.dumps(payload, separators=(",", ":"), ensure_ascii=True),
                        rid,
                    ),
                )
                conn.execute("COMMIT;")
            except Exception:
                conn.execute("ROLLBACK;")
                raise

    def delete_request_ticket_history(self, request_ids: list[str]) -> int:
        ids = [str(item or '').strip() for item in (request_ids or []) if str(item or '').strip()]
        if not ids:
            return 0
        placeholders = ",".join(["?"] * len(ids))
        with self._connect() as conn:
            cur = conn.execute(f"DELETE FROM request_tickets WHERE request_id IN ({placeholders});", ids)
            return int(cur.rowcount or 0)

    def list_request_tickets(
        self,
        *,
        category: str = '',
        status: str = '',
        q: str = '',
        date_from: str = '',
        date_to: str = '',
        limit: int = 500,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        where = []
        params = []
        if category and category != 'all':
            where.append("ticket_category = ?")
            params.append(str(category).strip().lower())
        if status and status != 'all':
            where.append("request_status = ?")
            params.append(str(status).strip().lower())
        if date_from:
            where.append("substr(requested_at, 1, 10) >= ?")
            params.append(str(date_from).strip())
        if date_to:
            where.append("substr(requested_at, 1, 10) <= ?")
            params.append(str(date_to).strip())
        if q:
            q_like = f"%{str(q).strip().lower()}%"
            where.append(
                "("
                "lower(request_id) LIKE ? OR lower(raised_by_email) LIKE ? OR lower(beneficiary_email) LIKE ? "
                "OR lower(account_id) LIKE ? OR lower(resource_target) LIKE ? OR lower(requested_actions) LIKE ? "
                "OR lower(request_reason) LIKE ? OR lower(approver_emails) LIKE ? OR lower(approved_by) LIKE ? "
                "OR lower(declined_by) LIKE ? OR lower(decline_reason) LIKE ?"
                ")"
            )
            params.extend([q_like] * 11)
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        safe_limit = max(1, min(int(limit or 500), 5000))
        safe_offset = max(0, int(offset or 0))
        with self._connect() as conn:
            count_row = conn.execute(
                f"SELECT COUNT(1) AS c FROM request_tickets {where_sql};",
                params,
            ).fetchone()
            rows = conn.execute(
                f"""
                SELECT request_id, ticket_category, request_type, raised_by_email, beneficiary_email,
                       account_id, resource_target, requested_actions, request_reason, request_status,
                       approval_workflow_name, approver_emails, approved_by, declined_by, decline_reason,
                       requested_at, decision_at, expires_at, deleted_at, deleted_by, payload_json
                FROM request_tickets
                {where_sql}
                ORDER BY requested_at DESC, request_id DESC
                LIMIT ? OFFSET ?;
                """,
                [*params, safe_limit, safe_offset],
            ).fetchall()
        out = []
        for row in rows:
            payload = {}
            try:
                payload = json.loads(row["payload_json"] or "{}")
            except Exception:
                payload = {}
            out.append({
                "request_id": row["request_id"],
                "category": row["ticket_category"],
                "request_type": row["request_type"],
                "raised_by_email": row["raised_by_email"],
                "beneficiary_email": row["beneficiary_email"],
                "account_id": row["account_id"],
                "resource_target": row["resource_target"],
                "requested_actions": row["requested_actions"],
                "request_reason": row["request_reason"],
                "status": row["request_status"],
                "approval_workflow_name": row["approval_workflow_name"],
                "approver_emails": row["approver_emails"],
                "approved_by": row["approved_by"],
                "declined_by": row["declined_by"],
                "decline_reason": row["decline_reason"],
                "requested_at": row["requested_at"],
                "decision_at": row["decision_at"],
                "expires_at": row["expires_at"],
                "deleted_at": row["deleted_at"],
                "deleted_by": row["deleted_by"],
                "payload": payload if isinstance(payload, dict) else {},
            })
        return out, int((count_row["c"] if count_row else 0) or 0)

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

    def list_audit_logs(
        self,
        *,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict]:
        """Return audit log rows newest first (for admin audit-logs API)."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT ts, user_email, request_id, role, action, allowed, rows_returned, error, query, payload_json
                FROM audit_logs
                ORDER BY ts DESC
                LIMIT ? OFFSET ?
                """,
                (max(1, min(limit, 5000)), max(0, offset)),
            ).fetchall()
        out = []
        for row in rows:
            out.append({
                "timestamp": row["ts"],
                "user": row["user_email"],
                "request_id": row["request_id"],
                "role": row["role"],
                "action": row["action"],
                "allowed": bool(row["allowed"]),
                "rows_returned": row["rows_returned"],
                "error": row["error"],
                "query": (row["query"] or "")[:500],
                "payload": json.loads(row["payload_json"] or "{}"),
            })
        return out
