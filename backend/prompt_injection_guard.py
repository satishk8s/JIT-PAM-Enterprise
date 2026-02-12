# Prompt Injection Guard - Validates user input before sending to AI

import re

# Max input length to prevent overflow attacks
MAX_INPUT_LENGTH = 2000

# Patterns that indicate prompt injection
INJECTION_PATTERNS = [
    r'ignore\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)',
    r'disregard\s+(all\s+)?(rules?|instructions?)',
    r'override\s+(your\s+)?(instructions?|policy)',
    r'bypass\s+(security|restriction|guard)',
    r'you\s+must\s+(allow|grant|give)',
    r'system\s+prompt',
    r'admin\s+access\s+required',
    r'emergency\s+override',
    r'you\s+are\s+now\s+(admin|root|superuser)',
    r'act\s+as\s+(admin|root|administrator)',
    r'pretend\s+you\s+are',
    r'from\s+now\s+on\s+you',
    r'jailbreak',
    r'developer\s+mode',
    r'dan\s+mode',
    r'do\s+anything\s+now',
    r'no\s+restrictions',
    r'ignore\s+(all\s+)?(your\s+)?instructions',
    r'print\s+(your\s+)?(instructions|prompt|rules)',
    r'reveal\s+(your\s+)?(system\s+)?prompt',
    r'show\s+(your\s+)?(instructions|prompt)',
    r'what\s+are\s+your\s+instructions',
    r'new\s+instruction\s*:',
    r'new\s+prompt\s*:',
    r'\[INST\]',
    r'\[/INST\]',
    r'<\|.*\|>',
]

# SQL injection patterns for database chat/query inputs
SQL_INJECTION_PATTERNS = [
    r';\s*drop\s+(table|database|user)',
    r';\s*delete\s+from',
    r';\s*truncate\s+table',
    r'union\s+select\s+.*\s+from\s+information_schema',
    r'exec\s*\(|execute\s*\(|eval\s*\(',
    r'0x[0-9a-fA-F]+',
    r'--\s*$',
    r'/\*.*\*/',
    r'xp_cmdshell|sp_executesql',
    r'load_file\s*\(',
    r'into\s+outfile|into\s+dumpfile',
]


def validate_ai_input(user_input, check_sql=False):
    """
    Validate user input before sending to AI.
    Returns: (is_valid, error_message)
    """
    if not user_input or not isinstance(user_input, str):
        return False, "Input is required"
    
    user_input = user_input.strip()
    
    if len(user_input) > MAX_INPUT_LENGTH:
        return False, f"Input exceeds maximum length of {MAX_INPUT_LENGTH} characters"
    
    user_input_lower = user_input.lower()
    
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, user_input_lower, re.IGNORECASE):
            return False, "❌ SECURITY: Potential prompt injection detected. Please rephrase your request."
    
    if check_sql:
        for pattern in SQL_INJECTION_PATTERNS:
            if re.search(pattern, user_input, re.IGNORECASE):
                return False, "❌ SECURITY: Suspicious SQL pattern detected. Please use a simpler query."
    
    return True, None


# MVP 2: Role-based SQL enforcement
ROLE_ALLOWED_KEYWORDS = {
    'read_only': ['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'ANALYZE'],
    'read_limited_write': ['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'ANALYZE', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'],
    'read_full_write': ['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'INSERT', 'UPDATE', 'DELETE',
                        'MERGE', 'ANALYZE', 'TRUNCATE', 'CREATE', 'ALTER', 'DROP', 'RENAME'],
    'admin': None,  # All allowed (except always-blocked)
}
ALWAYS_BLOCKED = [
    ('DROP DATABASE', 'Database deletion is not allowed'),
    ('DROP USER', 'User deletion is not allowed'),
    ('CREATE USER', 'User creation requires admin role'),
    ('GRANT ', 'Grant requires admin role'),
    ('REVOKE ', 'Revoke requires admin role'),
    ('SHUTDOWN', 'Shutdown is not allowed'),
    ('SYSTEM ', 'System commands are not allowed'),
]


def _get_first_sql_keyword(query):
    """Extract first SQL keyword from query (handles comments)."""
    q = query.strip()
    while q.upper().startswith('--') or q.upper().startswith('/*'):
        if q.upper().startswith('--'):
            idx = q.find('\n')
            q = q[idx + 1:].strip() if idx >= 0 else ''
        else:
            idx = q.find('*/')
            q = q[idx + 2:].strip() if idx >= 0 else ''
    m = re.match(r'^(\w+)', q, re.IGNORECASE)
    return m.group(1).upper() if m else ''


def validate_sql_query(query, role='read_only'):
    """
    Validate SQL query by role. MVP 2: Role-based enforcement.
    Returns: (is_valid, error_message)
    """
    if not query or not isinstance(query, str):
        return False, "Query is required"
    
    query_upper = query.strip().upper()
    
    for pattern, msg in ALWAYS_BLOCKED:
        if pattern in query_upper:
            # Allow GRANT/REVOKE only for admin role (still blocked for others).
            if role == 'admin' and pattern in ('GRANT ', 'REVOKE '):
                continue
            return False, f"❌ SECURITY: {msg}"
    
    if role == 'admin':
        return True, None
    
    keyword = _get_first_sql_keyword(query)
    if not keyword:
        return False, "Invalid query"
    
    allowed = ROLE_ALLOWED_KEYWORDS.get(role, ROLE_ALLOWED_KEYWORDS['read_only'])
    if keyword not in allowed:
        return False, f"❌ SECURITY: {keyword} is not allowed for role '{role}'. Allowed: {', '.join(allowed)}"
    
    return True, None
