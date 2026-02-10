"""
Minimal database executor for the proxy. Uses PyMySQL.
Proxy receives host/port/username/password from the backend (from Vault); this module only runs the query.
"""
import pymysql


def execute_query(host, port, username, password, database, query):
    """Execute SQL query against MySQL. Returns {'results': [...]} for SELECT or {'affected_rows': n} for writes."""
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
