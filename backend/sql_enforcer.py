"""
SQL Enforcer for Database Proxy
================================
TEACHING: This module enforces SELECT-only for the proxy.
The proxy uses this INSTEAD of trusting the client or the broader validate_sql_query.
Principle: "Deterministic over intelligent" — code rules, not AI judgment.
"""

import re

# Maximum query length to prevent DoS
MAX_QUERY_LENGTH = 10000

# ONLY these keywords allowed for proxy (read-only access)
PROXY_ALLOWED_KEYWORDS = {'SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'WITH'}

# Block these even if they appear in subqueries or comments
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


def enforce_select_only(query: str):
    """
    Enforce SELECT-only for the database proxy.
    Returns: (is_valid, error_message)
    
    TEACHING: This is the proxy's enforcement layer. Even if the backend
    sends a bad query, we block it here. Defense in depth.
    """
    if not query or not isinstance(query, str):
        return False, "Query is required"
    
    query = query.strip()
    if len(query) > MAX_QUERY_LENGTH:
        return False, f"Query exceeds maximum length of {MAX_QUERY_LENGTH} characters"
    
    # Check blocked patterns first (catches INSERT in subquery, etc.)
    for pattern, msg in BLOCKED_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return False, f"❌ PROXY BLOCKED: {msg}"
    
    # First keyword must be allowed
    keyword = get_first_sql_keyword(query)
    if not keyword:
        return False, "Invalid or empty query"
    
    if keyword not in PROXY_ALLOWED_KEYWORDS:
        return False, f"❌ PROXY BLOCKED: '{keyword}' is not allowed. Only read-only queries (SELECT, SHOW, etc.) are permitted."
    
    return True, None

