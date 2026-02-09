"""
Database Access Proxy
=====================
TEACHING: This is the ENFORCEMENT POINT. It is the ONLY component that connects
to the database. Users never see credentials; they send queries through Flask,
which forwards to us. We enforce SELECT-only and log everything.

Run: python database_proxy.py
Listens on: http://127.0.0.1:5002 (internal only - not exposed to internet)
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS

# Import our enforcer and database executor
from sql_enforcer import enforce_select_only
from database_manager import execute_query

app = Flask(__name__)
CORS(app)  # Only for localhost; in production, restrict origin

# Config
MAX_ROWS = 10000
QUERY_TIMEOUT_SEC = 30
GUARDRAILS_OFF = os.getenv('GUARDRAILS_OFF', 'false').lower() == 'true'


def log_proxy_action(user_email: str, request_id: str, query: str, allowed: bool, rows: int = 0, error: str = None):
    """Log every query attempt for audit. In production, write to file/DB/audit service."""
    import datetime
    action = "ALLOWED" if allowed else "BLOCKED"
    msg = f"[{datetime.datetime.now().isoformat()}] {action} | user={user_email} | request_id={request_id} | rows={rows} | error={error or '-'}"
    if not allowed:
        msg += f" | query_preview={query[:100]}..."
    print(msg)
    # TODO: Write to audit_log table or external service


@app.route('/health', methods=['GET'])
def health():
    """Health check for monitoring."""
    return jsonify({'status': 'ok', 'service': 'database-proxy'})


@app.route('/execute', methods=['POST'])
def execute():
    """
    Execute a read-only query. Called by Flask backend only (internal).
    
    Expects JSON:
    {
        "host": "db.example.com",
        "port": 3306,
        "username": "...",
        "password": "...",
        "database": "mydb",
        "query": "SELECT * FROM users LIMIT 10",
        "user_email": "user@company.com",   # for audit
        "request_id": "uuid-..."            # for audit
    }
    
    TEACHING: We receive credentials from Flask over localhost. The user/browser
    never sees them. Flask got them from Vault or its internal store.
    """
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
            return jsonify({'error': 'Missing required fields: host, username, password, query'}), 400
        
        role = data.get('role', 'read_only')
        
        # ENFORCEMENT: Role-based SQL validation (read_limited_write allows INSERT/UPDATE/DELETE)
        if not GUARDRAILS_OFF:
            if role in ('read_limited_write', 'read_full_write', 'admin'):
                try:
                    from prompt_injection_guard import validate_sql_query
                    is_valid, err_msg = validate_sql_query(query, role=role)
                except Exception:
                    is_valid, err_msg = enforce_select_only(query)
            else:
                is_valid, err_msg = enforce_select_only(query)
            if not is_valid:
                log_proxy_action(user_email, request_id, query, allowed=False, error=err_msg)
                return jsonify({'error': err_msg}), 400
        
        # Execute (database_manager handles connection)
        result = execute_query(
            host=host,
            port=port,
            username=username,
            password=password,
            database=database,
            query=query
        )
        
        if 'error' in result:
            log_proxy_action(user_email, request_id, query, allowed=False, error=result['error'])
            return jsonify(result), 500
        
        rows = len(result.get('results', [])) if isinstance(result.get('results'), list) else result.get('affected_rows', 0)
        log_proxy_action(user_email, request_id, query, allowed=True, rows=rows)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('DB_PROXY_PORT', 5002))
    # Bind to 127.0.0.1 only - not exposed to network
    app.run(host='127.0.0.1', port=port, debug=False)

