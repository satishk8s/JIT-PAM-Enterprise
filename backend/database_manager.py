"""
Use PyMySQL (pure Python) instead of mysql-connector-python to avoid
mysql_native_password plugin .so loading errors on some systems.
"""
import pymysql
import secrets
import string
import re
try:
    import psycopg  # psycopg v3
except Exception:  # pragma: no cover
    psycopg = None
try:
    import psycopg2  # psycopg2 fallback
except Exception:  # pragma: no cover
    psycopg2 = None

_IDENTIFIER_RE = re.compile(r'^[A-Za-z0-9_]+$')
_PERMISSION_TOKEN_RE = re.compile(r'^[A-Z_]+$')


def _quote_mysql_identifier(value):
    ident = str(value or '').strip()
    if not _IDENTIFIER_RE.fullmatch(ident):
        raise ValueError('Invalid MySQL identifier')
    return f"`{ident}`"


def _normalize_permissions(value):
    raw = str(value or '').strip().upper()
    if raw in ('ALL', 'ALL PRIVILEGES'):
        return 'ALL PRIVILEGES'
    tokens = [token.strip() for token in raw.split(',') if token.strip()]
    if not tokens:
        raise ValueError('Permissions required')
    for token in tokens:
        if not _PERMISSION_TOKEN_RE.fullmatch(token):
            raise ValueError('Invalid permission token')
    return ', '.join(tokens)


def _normalize_query(value):
    query = str(value or '').strip()
    if not query:
        raise ValueError('Query required')
    # Allow one trailing semicolon but block stacked statements.
    trimmed = query.rstrip()
    if trimmed.endswith(';'):
        trimmed = trimmed[:-1].rstrip()
    if ';' in trimmed:
        raise ValueError('Only a single SQL statement is allowed')
    return trimmed

def generate_password(length=16):
    """Generate random password"""
    chars = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(chars) for _ in range(length))

def create_database_user(host, port, admin_user, admin_password, new_user, new_password, database, permissions):
    """Create database user with specified permissions.
    MySQL treats localhost and 127.0.0.1 as different. DROP then CREATE ensures correct password."""
    try:
        # Use 127.0.0.1 for connection - some MySQL configs reject 'localhost'
        conn_host = '127.0.0.1' if host in ('localhost', '::1') else host
        conn = pymysql.connect(
            host=conn_host,
            port=port,
            user=admin_user,
            password=admin_password
        )
        cursor = conn.cursor()
        
        # Hosts to create user for (MySQL treats localhost vs 127.0.0.1 vs % as different)
        hosts = ["%"]
        if host in ("localhost", "127.0.0.1", "::1"):
            hosts = ["%", "localhost", "127.0.0.1"]
        
        # DROP existing user for all hosts first - ensures password is updated (CREATE USER IF NOT EXISTS doesn't update password)
        for h in hosts:
            try:
                cursor.execute("DROP USER IF EXISTS %s@%s", (new_user, h))
            except Exception:
                pass
        
        database_identifier = _quote_mysql_identifier(database)
        grant_permissions = _normalize_permissions(permissions)

        # CREATE and GRANT for each host
        for h in hosts:
            cursor.execute("CREATE USER %s@%s IDENTIFIED BY %s", (new_user, h, new_password))
            cursor.execute(f"GRANT {grant_permissions} ON {database_identifier}.* TO %s@%s", (new_user, h))
        
        cursor.execute("FLUSH PRIVILEGES")
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return {'success': True}
    except Exception as e:
        return {'error': str(e)}

def execute_query(host, port, username, password, database, query, *, ssl=None, connect_timeout=10, read_timeout=30, write_timeout=30, client_flag=0, auth_plugin_map=None):
    """Execute SQL query.

    Notes:
    - `ssl` can be provided for IAM auth / TLS-required databases (dict passed to PyMySQL).
    - `auth_plugin_map` can be provided to enable special auth plugins when required.
    """
    try:
        kwargs = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "database": database,
            "cursorclass": pymysql.cursors.DictCursor,
            "connect_timeout": int(connect_timeout or 10),
            "read_timeout": int(read_timeout or 30),
            "write_timeout": int(write_timeout or 30),
        }
        if ssl:
            kwargs["ssl"] = ssl
        if client_flag:
            kwargs["client_flag"] = int(client_flag)
        if auth_plugin_map:
            kwargs["auth_plugin_map"] = auth_plugin_map

        normalized_query = _normalize_query(query)

        conn = pymysql.connect(**kwargs)
        cursor = conn.cursor()
        
        cursor.execute(normalized_query)
        
        if normalized_query.upper().startswith('SELECT'):
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

def inspect_mysql_connection(host, port, username, password, database=None, *, ssl=None, connect_timeout=10, read_timeout=30, write_timeout=30):
    """Validate login and collect a small grant summary for a MySQL-family user."""
    try:
        kwargs = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "cursorclass": pymysql.cursors.DictCursor,
            "connect_timeout": int(connect_timeout or 10),
            "read_timeout": int(read_timeout or 30),
            "write_timeout": int(write_timeout or 30),
        }
        if database:
            kwargs["database"] = database
        if ssl:
            kwargs["ssl"] = ssl

        conn = pymysql.connect(**kwargs)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT CURRENT_USER() AS current_user, USER() AS session_user, DATABASE() AS current_database, @@hostname AS server_hostname"
        )
        profile = cursor.fetchone() or {}
        cursor.execute("SHOW GRANTS")
        rows = cursor.fetchall() or []
        grants = []
        for row in rows:
            if isinstance(row, dict):
                grants.extend([str(value).strip() for value in row.values() if str(value or '').strip()])
        cursor.close()
        conn.close()
        return {
            'success': True,
            'profile': profile,
            'grants': grants,
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def inspect_postgres_connection(host, port, username, password, database='postgres', *, sslmode='require', connect_timeout=10):
    """Validate login and collect a small grant summary for a PostgreSQL-family user."""
    db_name = str(database or 'postgres').strip() or 'postgres'
    ssl_mode = str(sslmode or 'require').strip() or 'require'
    timeout = int(connect_timeout or 10)
    if psycopg is None and psycopg2 is None:
        return {'success': False, 'error': 'PostgreSQL driver is not installed (psycopg).'}
    try:
        if psycopg is not None:
            conn = psycopg.connect(
                host=host,
                port=int(port or 5432),
                user=username,
                password=password,
                dbname=db_name,
                sslmode=ssl_mode,
                connect_timeout=timeout,
            )
            try:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT CURRENT_USER::text, SESSION_USER::text, CURRENT_DATABASE()::text"
                    )
                    row = cursor.fetchone() or ()
                    profile = {
                        'current_user': str(row[0] if len(row) > 0 else '').strip(),
                        'session_user': str(row[1] if len(row) > 1 else '').strip(),
                        'current_database': str(row[2] if len(row) > 2 else '').strip(),
                    }
                    cursor.execute(
                        "SELECT table_schema::text, table_name::text, privilege_type::text "
                        "FROM information_schema.role_table_grants "
                        "WHERE grantee = CURRENT_USER "
                        "ORDER BY table_schema, table_name, privilege_type "
                        "LIMIT 100"
                    )
                    rows = cursor.fetchall() or []
                    grants = [
                        f"{str(r[0]).strip()}.{str(r[1]).strip()}:{str(r[2]).strip()}"
                        for r in rows
                        if r and len(r) >= 3
                    ]
            finally:
                conn.close()
            return {'success': True, 'profile': profile, 'grants': grants}

        conn = psycopg2.connect(
            host=host,
            port=int(port or 5432),
            user=username,
            password=password,
            dbname=db_name,
            sslmode=ssl_mode,
            connect_timeout=timeout,
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT CURRENT_USER::text, SESSION_USER::text, CURRENT_DATABASE()::text"
                )
                row = cursor.fetchone() or ()
                profile = {
                    'current_user': str(row[0] if len(row) > 0 else '').strip(),
                    'session_user': str(row[1] if len(row) > 1 else '').strip(),
                    'current_database': str(row[2] if len(row) > 2 else '').strip(),
                }
                cursor.execute(
                    "SELECT table_schema::text, table_name::text, privilege_type::text "
                    "FROM information_schema.role_table_grants "
                    "WHERE grantee = CURRENT_USER "
                    "ORDER BY table_schema, table_name, privilege_type "
                    "LIMIT 100"
                )
                rows = cursor.fetchall() or []
                grants = [
                    f"{str(r[0]).strip()}.{str(r[1]).strip()}:{str(r[2]).strip()}"
                    for r in rows
                    if r and len(r) >= 3
                ]
        finally:
            conn.close()
        return {'success': True, 'profile': profile, 'grants': grants}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def list_mysql_database_users(host, port, username, password, *, ssl=None, connect_timeout=10, read_timeout=30, write_timeout=30):
    """Fetch a simple MySQL user inventory for security review."""
    try:
        kwargs = {
            "host": host,
            "port": port,
            "user": username,
            "password": password,
            "database": "mysql",
            "cursorclass": pymysql.cursors.DictCursor,
            "connect_timeout": int(connect_timeout or 10),
            "read_timeout": int(read_timeout or 30),
            "write_timeout": int(write_timeout or 30),
        }
        if ssl:
            kwargs["ssl"] = ssl

        conn = pymysql.connect(**kwargs)
        cursor = conn.cursor()
        rows = []
        queries = [
            (
                "SELECT user AS username, host, plugin "
                "FROM mysql.user "
                "ORDER BY user, host"
            ),
            (
                "SELECT "
                "SUBSTRING_INDEX(REPLACE(grantee, \"'\", ''), '@', 1) AS username, "
                "SUBSTRING_INDEX(REPLACE(grantee, \"'\", ''), '@', -1) AS host, "
                "'' AS plugin "
                "FROM information_schema.user_privileges "
                "GROUP BY grantee "
                "ORDER BY username, host"
            ),
        ]
        last_error = None
        for query in queries:
            try:
                cursor.execute(query)
                rows = cursor.fetchall() or []
                if rows:
                    break
            except Exception as exc:
                last_error = exc
                continue
        cursor.close()
        conn.close()
        if not rows and last_error:
            raise last_error
        users = []
        seen = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            normalized = (
                str(row.get('username') or '').strip(),
                str(row.get('host') or '').strip(),
                str(row.get('plugin') or '').strip(),
            )
            if normalized in seen:
                continue
            seen.add(normalized)
            users.append({
                'username': normalized[0],
                'host': normalized[1],
                'plugin': normalized[2],
            })
        return {'success': True, 'users': users}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def revoke_database_access(host, port, admin_user, admin_password, username):
    """Revoke user access and drop user from all hosts"""
    try:
        conn_host = '127.0.0.1' if host in ('localhost', '::1') else host
        conn = pymysql.connect(
            host=conn_host,
            port=port,
            user=admin_user,
            password=admin_password
        )
        cursor = conn.cursor()
        
        hosts = ["%", "localhost", "127.0.0.1"] if host in ("localhost", "127.0.0.1", "::1") else ["%"]
        for h in hosts:
            try:
                cursor.execute("DROP USER IF EXISTS %s@%s", (username, h))
            except Exception:
                pass
        cursor.execute("FLUSH PRIVILEGES")
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return {'success': True}
    except Exception as e:
        return {'error': str(e)}
