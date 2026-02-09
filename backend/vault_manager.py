import hvac
import os
from datetime import timedelta

class VaultManager:
    @staticmethod
    def get_client():
        """Get Vault client"""
        vault_url = os.getenv('VAULT_ADDR', 'http://127.0.0.1:8200')
        vault_token = os.getenv('VAULT_TOKEN', 'dev-token')
        
        client = hvac.Client(url=vault_url, token=vault_token)
        return client
    
    @staticmethod
    def create_database_credentials(db_host, db_name, username, permissions, duration_hours=2):
        """Create temporary database credentials via Vault"""
        try:
            client = VaultManager.get_client()
            
            # Generate role name
            role_name = f"jit-{username}-{db_name}"
            
            # Map permissions to SQL statements
            if permissions == 'SELECT':
                creation_statements = [f"GRANT SELECT ON {db_name}.* TO '{{{{name}}}}'@'%' IDENTIFIED BY '{{{{password}}}}';"]
            elif 'INSERT' in permissions or 'UPDATE' in permissions:
                creation_statements = [f"GRANT SELECT, INSERT, UPDATE ON {db_name}.* TO '{{{{name}}}}'@'%' IDENTIFIED BY '{{{{password}}}}';"]
            else:
                creation_statements = [f"GRANT ALL PRIVILEGES ON {db_name}.* TO '{{{{name}}}}'@'%' IDENTIFIED BY '{{{{password}}}}';"]
            
            # Create role in Vault
            client.secrets.database.create_role(
                name=role_name,
                db_name='mysql',
                creation_statements=creation_statements,
                default_ttl=f'{duration_hours}h',
                max_ttl=f'{duration_hours}h'
            )
            
            # Generate credentials
            creds = client.secrets.database.generate_credentials(name=role_name)
            
            return {
                'username': creds['data']['username'],
                'password': creds['data']['password'],
                'lease_id': creds['lease_id'],
                'lease_duration': creds['lease_duration']
            }
        except Exception as e:
            print(f"Vault error: {e}")
            # Fallback to manual credential creation
            return None
    
    @staticmethod
    def revoke_credentials(lease_id):
        """Revoke Vault-generated credentials"""
        try:
            client = VaultManager.get_client()
            client.sys.revoke_lease(lease_id)
            return True
        except Exception as e:
            print(f"Vault revoke error: {e}")
            return False
