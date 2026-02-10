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
L1_FIRST_KEYWORDS = {'SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'WITH'}
L2_FIRST_KEYWORDS = L1_FIRST_KEYWORDS | {'INSERT', 'UPDATE'}
L3_FIRST_KEYWORDS = {'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'RENAME'}

DCL_BLOCKED = [(r'\bGRANT\b', 'GRANT is not allowed (DCL)'), (r'\bREVOKE\b', 'REVOKE is not allowed (DCL)')]
BLOCKED_IN_QUERY = [
    (r'\bINTO\s+OUTFILE\b', 'SELECT INTO OUTFILE is not allowed'),
    (r'\bINTO\s+DUMPFILE\b', 'SELECT INTO DUMPFILE is not allowed'),
    (r'\bLOAD_FILE\b', 'LOAD_FILE is not allowed'),
    (r'\bEXEC\b', 'EXEC is not allowed'),
    (r'\bEXECUTE\b', 'EXECUTE is not allowed'),
    (r'\bCALL\b', 'CALL is not allowed'),
]


def get_first_sql_keyword(query: str) -> str:
    q = query.strip()
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
    """Enforce SQL by role: L1, L2, L3. Returns (is_valid, error_message)."""
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
    for pattern, msg in DCL_BLOCKED:
        if re.search(pattern, q, re.IGNORECASE):
            return False, f"❌ PROXY BLOCKED: {msg}"
    for pattern, msg in BLOCKED_IN_QUERY:
        if re.search(pattern, q, re.IGNORECASE):
            return False, f"❌ PROXY BLOCKED: {msg}"
    keyword = get_first_sql_keyword(q)
    if not keyword:
        return False, "Invalid or empty query"
    if role == "L1":
        if keyword not in L1_FIRST_KEYWORDS:
            return False, f"❌ PROXY BLOCKED (L1): '{keyword}' is not allowed. L1 = read only (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH)."
    elif role == "L2":
        if keyword not in L2_FIRST_KEYWORDS:
            return False, f"❌ PROXY BLOCKED (L2): '{keyword}' is not allowed. L2 = read + insert/update only (no DELETE, no DDL)."
    else:
        if keyword not in L3_FIRST_KEYWORDS:
            return False, f"❌ PROXY BLOCKED (L3): '{keyword}' is not allowed. L3 = delete + DDL only (DELETE, DROP, TRUNCATE, ALTER, CREATE, RENAME)."
    return True, None
