"""
Database Access Proxy - L1/L2/L3 enforcement.
Runs on its own EC2. Backend (PAM) sends queries here; proxy enforces role and runs against RDS.
"""
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from sql_enforcer import enforce_sql_by_role
from database_manager import execute_query


def _normalize_role(role: str) -> str:
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


def log_proxy_action(user_email: str, request_id: str, query: str, allowed: bool, rows: int = 0, error: str = None, role: str = None):
    import datetime
    action = "ALLOWED" if allowed else "BLOCKED"
    msg = f"[{datetime.datetime.now().isoformat()}] {action} | role={role or '-'} | user={user_email} | request_id={request_id} | rows={rows} | error={error or '-'}"
    if not allowed:
        msg += f" | query_preview={query[:100]}..."
    print(msg)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'database-proxy'})


@app.route('/execute', methods=['POST'])
def execute():
    """
    Expects JSON: host, port, username, password, database, query, role (L1|L2|L3), user_email, request_id.
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
        role = _normalize_role(data.get('role') or 'L1')
        if not GUARDRAILS_OFF:
            is_valid, err_msg = enforce_sql_by_role(query, role)
            if not is_valid:
                log_proxy_action(user_email, request_id, query, allowed=False, error=err_msg, role=role)
                return jsonify({'error': err_msg}), 400
        result = execute_query(host=host, port=port, username=username, password=password, database=database, query=query)
        if 'error' in result:
            log_proxy_action(user_email, request_id, query, allowed=False, error=result['error'], role=role)
            return jsonify(result), 500
        rows = len(result.get('results', [])) if isinstance(result.get('results'), list) else result.get('affected_rows', 0)
        log_proxy_action(user_email, request_id, query, allowed=True, rows=rows, role=role)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('DB_PROXY_PORT', 5002))
    host = os.getenv('DB_PROXY_HOST', '127.0.0.1')
    app.run(host=host, port=port, debug=False)
