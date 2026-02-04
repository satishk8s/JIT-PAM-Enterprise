import mysql.connector
import secrets
import string

def generate_password(length=16):
    """Generate random password"""
    chars = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(chars) for _ in range(length))

def create_database_user(host, port, admin_user, admin_password, new_user, new_password, database, permissions):
    """Create database user with specified permissions"""
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=admin_user,
            password=admin_password
        )
        cursor = conn.cursor()
        
        # Create user
        cursor.execute(f"CREATE USER IF NOT EXISTS '{new_user}'@'%' IDENTIFIED BY '{new_password}'")
        
        # Grant permissions
        if permissions == 'ALL':
            cursor.execute(f"GRANT ALL PRIVILEGES ON {database}.* TO '{new_user}'@'%'")
        else:
            cursor.execute(f"GRANT {permissions} ON {database}.* TO '{new_user}'@'%'")
        
        cursor.execute("FLUSH PRIVILEGES")
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return {'success': True}
    except Exception as e:
        return {'error': str(e)}

def execute_query(host, port, username, password, database, query):
    """Execute SQL query"""
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=username,
            password=password,
            database=database
        )
        cursor = conn.cursor(dictionary=True)
        
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
    """Revoke user access and drop user"""
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=admin_user,
            password=admin_password
        )
        cursor = conn.cursor()
        
        cursor.execute(f"DROP USER IF EXISTS '{username}'@'%'")
        cursor.execute("FLUSH PRIVILEGES")
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return {'success': True}
    except Exception as e:
        return {'error': str(e)}
