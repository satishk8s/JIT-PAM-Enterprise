#!/bin/bash
# Run this script ON THE PROXY EC2 (e.g. 172.11.133.53) as root or with sudo.
# It creates /opt/db-proxy and all required files.

set -e
DIR=/opt/db-proxy
mkdir -p "$DIR"
cd "$DIR"

# requirements.txt
cat > requirements.txt << 'EOF'
Flask==2.3.3
Flask-CORS==4.0.0
PyMySQL>=1.1.0
EOF

# sql_enforcer.py
cat > sql_enforcer.py << 'ENDPY'
"""
SQL Enforcer for Database Proxy - L1/L2/L3.
"""
import re
MAX_QUERY_LENGTH = 10000
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
def get_first_sql_keyword(query):
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
def enforce_sql_by_role(query, role):
    if not query or not isinstance(query, str):
        return False, "Query is required"
    q = query.strip()
    if len(q) > MAX_QUERY_LENGTH:
        return False, "Query exceeds maximum length"
    role = (role or "").strip().upper()
    if role in ("READ_ONLY", ""):
        role = "L1"
    if role not in ("L1", "L2", "L3"):
        return False, "Unknown role"
    for pattern, msg in DCL_BLOCKED:
        if re.search(pattern, q, re.IGNORECASE):
            return False, "PROXY BLOCKED: " + msg
    for pattern, msg in BLOCKED_IN_QUERY:
        if re.search(pattern, q, re.IGNORECASE):
            return False, "PROXY BLOCKED: " + msg
    keyword = get_first_sql_keyword(q)
    if not keyword:
        return False, "Invalid or empty query"
    if role == "L1" and keyword not in L1_FIRST_KEYWORDS:
        return False, "L1 = read only (SELECT, SHOW, etc)"
    if role == "L2" and keyword not in L2_FIRST_KEYWORDS:
        return False, "L2 = read + insert/update only"
    if role == "L3" and keyword not in L3_FIRST_KEYWORDS:
        return False, "L3 = delete + DDL only"
    return True, None
ENDPY

# database_manager.py
cat > database_manager.py << 'ENDPY'
import pymysql
def execute_query(host, port, username, password, database, query):
    try:
        conn = pymysql.connect(
            host=host,
            port=int(port),
            user=username,
            password=password,
            database=database or '',
            cursorclass=pymysql.cursors.DictCursor
        )
        cursor = conn.cursor()
        cursor.execute(query)
        if query.strip().upper().startswith('SELECT'):
            results = cursor.fetchall()
            cursor.close()
            conn.close()
            return {'results': results}
        else:
            conn.commit()
            affected = cursor.rowcount
            cursor.close()
            conn.close()
            return {'affected_rows': affected}
    except Exception as e:
        return {'error': str(e)}
ENDPY

# database_proxy.py
cat > database_proxy.py << 'ENDPY'
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from sql_enforcer import enforce_sql_by_role
from database_manager import execute_query

def _normalize_role(role):
    if not role:
        return "L1"
    r = (role or "").strip().upper()
    if r in ("L1", "L2", "L3"):
        return r
    if r in ("READ_ONLY", "READONLY"):
        return "L1"
    if r in ("READ_LIMITED_WRITE", "L2_WRITE"):
        return "L2"
    if r in ("READ_FULL_WRITE", "ADMIN", "L3_DDL"):
        return "L3"
    return "L1"

app = Flask(__name__)
CORS(app)
GUARDRAILS_OFF = os.getenv('GUARDRAILS_OFF', 'false').lower() == 'true'

def log_proxy_action(user_email, request_id, query, allowed, rows=0, error=None, role=None):
    import datetime
    action = "ALLOWED" if allowed else "BLOCKED"
    msg = "[%s] %s | role=%s | user=%s | request_id=%s | rows=%s | error=%s" % (
        datetime.datetime.now().isoformat(), action, role or '-', user_email, request_id, rows, error or '-')
    if not allowed:
        msg += " | query_preview=" + (query[:100] if query else '') + "..."
    print(msg)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'database-proxy'})

@app.route('/execute', methods=['POST'])
def execute():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400
        host = data.get('host')
        port = int(data.get('port', 3306))
        username = data.get('username')
        password = data.get('password')
        database = data.get('database', '')
        query = (data.get('query') or '').strip()
        user_email = data.get('user_email', 'unknown')
        request_id = data.get('request_id', 'unknown')
        if not all([host, username, password, query]):
            return jsonify({'error': 'Missing required fields'}), 400
        role = _normalize_role(data.get('role') or 'L1')
        if not GUARDRAILS_OFF:
            is_valid, err_msg = enforce_sql_by_role(query, role)
            if not is_valid:
                log_proxy_action(user_email, request_id, query, False, error=err_msg, role=role)
                return jsonify({'error': err_msg}), 400
        result = execute_query(host=host, port=port, username=username, password=password, database=database, query=query)
        if 'error' in result:
            log_proxy_action(user_email, request_id, query, False, error=result['error'], role=role)
            return jsonify(result), 500
        rows = len(result.get('results', [])) if isinstance(result.get('results'), list) else result.get('affected_rows', 0)
        log_proxy_action(user_email, request_id, query, True, rows=rows, role=role)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('DB_PROXY_PORT', 5002))
    host = os.getenv('DB_PROXY_HOST', '127.0.0.1')
    app.run(host=host, port=port, debug=False)
ENDPY

# systemd service (User=root since you run as root)
cat > db-proxy.service << 'EOF'
[Unit]
Description=Database Access Proxy (L1/L2/L3)
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/db-proxy
Environment="PATH=/opt/db-proxy/venv/bin"
Environment="DB_PROXY_HOST=0.0.0.0"
Environment="DB_PROXY_PORT=5002"
ExecStart=/opt/db-proxy/venv/bin/python3 /opt/db-proxy/database_proxy.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Files created in $DIR:"
ls -la "$DIR"

# Create venv and install deps if not present
if [ ! -f "$DIR/venv/bin/python3" ]; then
  echo "Creating venv and installing dependencies..."
  python3 -m venv "$DIR/venv"
  "$DIR/venv/bin/pip" install --upgrade pip -q
  "$DIR/venv/bin/pip" install -r "$DIR/requirements.txt" -q
  echo "Venv and pip install done."
else
  echo "Venv exists; run: $DIR/venv/bin/pip install -r $DIR/requirements.txt"
fi

echo ""
echo "Next steps (run as root):"
echo "  sudo cp $DIR/db-proxy.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable db-proxy"
echo "  sudo systemctl start db-proxy"
echo "  curl -s http://127.0.0.1:5002/health"
