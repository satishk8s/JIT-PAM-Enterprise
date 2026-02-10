# MVP 2: Audit logging for database access

import os
from datetime import datetime

AUDIT_DIR = os.path.join(os.path.dirname(__file__), 'audit')
AUDIT_FILE = os.path.join(AUDIT_DIR, 'db_queries.log')


def _ensure_audit_dir():
    os.makedirs(AUDIT_DIR, exist_ok=True)


def log_db_query(user_email, request_id, role, query, allowed, rows_returned=None, error=None):
    """
    Append audit log entry. Immutable append-only.
    """
    _ensure_audit_dir()
    ts = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = str(rows_returned) if rows_returned is not None else '-'
    err = (error or '').replace('\t', ' ').replace('\n', ' ')
    # Tab-separated for easy parsing
    line = f"{ts}\t{user_email}\t{request_id}\t{role}\t{allowed}\t{rows}\t{err}\t{query[:500]}\n"
    with open(AUDIT_FILE, 'a', encoding='utf-8') as f:
        f.write(line)
