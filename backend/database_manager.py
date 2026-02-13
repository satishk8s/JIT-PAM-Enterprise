"""
Use PyMySQL (pure Python) instead of mysql-connector-python to avoid
mysql_native_password plugin .so loading errors on some systems.
"""
import pymysql
import secrets
import string

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
        
        # CREATE and GRANT for each host
        for h in hosts:
            cursor.execute("CREATE USER %s@%s IDENTIFIED BY %s", (new_user, h, new_password))
            if permissions in ('ALL', 'ALL PRIVILEGES'):
                cursor.execute(f"GRANT ALL PRIVILEGES ON `{database}`.* TO %s@%s", (new_user, h))
            else:
                cursor.execute(f"GRANT {permissions} ON `{database}`.* TO %s@%s", (new_user, h))
        
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

        conn = pymysql.connect(**kwargs)
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
