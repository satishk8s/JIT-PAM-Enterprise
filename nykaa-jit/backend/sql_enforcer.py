"""
SQL Enforcer for Database Proxy
================================
Role-based enforcement (L1 / L2 / L3). Deterministic rules, no AI.
- L1 = Read only (DQL: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH)
- L2 = Read + limited write (DQL + INSERT, UPDATE); no DELETE, no DDL
- L3 = Destructive only (DELETE + DDL: DROP, TRUNCATE, ALTER, CREATE, RENAME)
DCL (GRANT, REVOKE) is always blocked for all roles.
"""

import re

MAX_QUERY_LENGTH = 10000

# --- Role definitions (strategy: DQL, DML, DDL, DCL) ---
# L1 = DQL only (read)
L1_FIRST_KEYWORDS = {'SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'WITH'}
# L2 = DQL + INSERT, UPDATE (no DELETE, no DDL)
L2_FIRST_KEYWORDS = L1_FIRST_KEYWORDS | {'INSERT', 'UPDATE'}
# L3 = DELETE + DDL (destructive only)
L3_FIRST_KEYWORDS = {'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'RENAME'}

# DCL always blocked (no role can GRANT/REVOKE)
DCL_BLOCKED = [(r'\bGRANT\b', 'GRANT is not allowed (DCL)'), (r'\bREVOKE\b', 'REVOKE is not allowed (DCL)')]

# Block dangerous patterns that bypass main verb (e.g. in subqueries)
BLOCKED_IN_QUERY = [
    (r'\bINTO\s+OUTFILE\b', 'SELECT INTO OUTFILE is not allowed'),
    (r'\bINTO\s+DUMPFILE\b', 'SELECT INTO DUMPFILE is not allowed'),
    (r'\bLOAD_FILE\b', 'LOAD_FILE is not allowed'),
    (r'\bEXEC\b', 'EXEC is not allowed'),
    (r'\bEXECUTE\b', 'EXECUTE is not allowed'),
    (r'\bCALL\b', 'CALL is not allowed'),
]

# Legacy: for enforce_select_only (L1 behavior)
PROXY_ALLOWED_KEYWORDS = L1_FIRST_KEYWORDS
BLOCKED_PATTERNS = [
    (r'\bINSERT\b', 'INSERT is not allowed (write operation)'),
    (r'\bUPDATE\b', 'UPDATE is not allowed (write operation)'),
    (r'\bDELETE\b', 'DELETE is not allowed (write operation)'),
    (r'\bDROP\b', 'DROP is not allowed (destructive)'),
    (r'\bTRUNCATE\b', 'TRUNCATE is not allowed (destructive)'),
    (r'\bCREATE\b', 'CREATE is not allowed (DDL)'),
    (r'\bALTER\b', 'ALTER is not allowed (DDL)'),
    (r'\bGRANT\b', 'GRANT is not allowed'),
    (r'\bREVOKE\b', 'REVOKE is not allowed'),
    (r'\bEXEC\b', 'EXEC is not allowed'),
    (r'\bEXECUTE\b', 'EXECUTE is not allowed'),
    (r'\bCALL\b', 'CALL is not allowed'),
    (r'\bINTO\s+OUTFILE\b', 'SELECT INTO OUTFILE is not allowed'),
    (r'\bINTO\s+DUMPFILE\b', 'SELECT INTO DUMPFILE is not allowed'),
    (r'\bLOAD_FILE\b', 'LOAD_FILE is not allowed'),
    (r'\bINTO\s+', 'SELECT INTO (writes elsewhere) is not allowed'),
]


def get_first_sql_keyword(query: str) -> str:
    """
    Extract the first SQL keyword, skipping comments.
    TEACHING: We need the "main" verb of the query to decide if it's read-only.
    """
    q = query.strip()
    # Skip leading comments
    while q:
        q_upper = q.upper()
        if q_upper.startswith('--'):
            idx = q.find('\n')
            q = q[idx + 1:].strip() if idx >= 0 else ''
        elif q_upper.startswith('/*'):
            idx = q.find('*/')
            q = q[idx + 2:].strip() if idx >= 0 else ''
        else:
            break
    match = re.match(r'^(\w+)', q, re.IGNORECASE)
    return match.group(1).upper() if match else ''


def enforce_sql_by_role(query: str, role: str):
    """
    Enforce SQL by role: L1 (read), L2 (read + insert/update), L3 (delete + DDL).
    Returns: (is_valid, error_message)
    Role can be 'L1', 'L2', 'L3', or 'read_only' (treated as L1).
    """
    if not query or not isinstance(query, str):
        return False, "Query is required"
    q = query.strip()
    if len(q) > MAX_QUERY_LENGTH:
        return False, f"Query exceeds maximum length of {MAX_QUERY_LENGTH} characters"

    role = (role or "").strip().upper()
    if role in ("READ_ONLY", ""):
        role = "L1"
    if role not in ("L1", "L2", "L3"):
        return False, f"Unknown role '{role}'. Use L1, L2, or L3."

    # DCL always blocked for every role
    for pattern, msg in DCL_BLOCKED:
        if re.search(pattern, q, re.IGNORECASE):
            return False, f"❌ PROXY BLOCKED: {msg}"
    # Dangerous patterns that must not appear anywhere
    for pattern, msg in BLOCKED_IN_QUERY:
        if re.search(pattern, q, re.IGNORECASE):
            return False, f"❌ PROXY BLOCKED: {msg}"

    keyword = get_first_sql_keyword(q)
    if not keyword:
        return False, "Invalid or empty query"

    if role == "L1":
        allowed = L1_FIRST_KEYWORDS
        if keyword not in allowed:
            return False, f"❌ PROXY BLOCKED (L1): '{keyword}' is not allowed. L1 = read only (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH)."
    elif role == "L2":
        allowed = L2_FIRST_KEYWORDS
        if keyword not in allowed:
            return False, f"❌ PROXY BLOCKED (L2): '{keyword}' is not allowed. L2 = read + insert/update only (no DELETE, no DDL)."
    else:  # L3
        allowed = L3_FIRST_KEYWORDS
        if keyword not in allowed:
            return False, f"❌ PROXY BLOCKED (L3): '{keyword}' is not allowed. L3 = delete + DDL only (DELETE, DROP, TRUNCATE, ALTER, CREATE, RENAME)."
    return True, None


def enforce_select_only(query: str):
    """
    Enforce SELECT-only (L1 / read-only). Convenience wrapper.
    Returns: (is_valid, error_message)
    """
    return enforce_sql_by_role(query, "L1")

