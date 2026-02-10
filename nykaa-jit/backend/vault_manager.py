"""
Vault manager for JIT database credentials.
Uses fixed Vault roles: jit-l1 (read), jit-l2 (read+write), jit-l3 (delete+DDL).
Vault holds RDS admin; this only calls generate_credentials. No role creation per request.
"""
import hvac
import os


def _request_role_to_vault_role(role: str) -> str:
    """Map PAM request role to Vault database role name."""
    if not role:
        return "jit-l1"
    r = (role or "").strip().upper()
    if r in ("L1", "READ_ONLY", "READONLY"):
        return "jit-l1"
    if r in ("L2", "READ_LIMITED_WRITE", "L2_WRITE"):
        return "jit-l2"
    if r in ("L3", "READ_FULL_WRITE", "ADMIN", "L3_DDL"):
        return "jit-l3"
    return "jit-l1"


class VaultManager:
    @staticmethod
    def get_client():
        """Get Vault client from env."""
        vault_url = os.getenv("VAULT_ADDR", "http://127.0.0.1:8200")
        vault_token = os.getenv("VAULT_TOKEN", "")
        client = hvac.Client(url=vault_url, token=vault_token)
        return client

    @staticmethod
    def create_database_credentials(role: str, duration_hours: int = 2, db_host=None, db_name=None, username=None, permissions=None):
        """
        Get short-lived DB credentials from Vault.
        Uses pre-created roles jit-l1, jit-l2, jit-l3 (configured on Vault server).
        role: L1, L2, L3 or read_only, read_limited_write, read_full_write, admin.
        db_host, db_name, username, permissions: ignored; kept for backward compatibility with callers.
        """
        try:
            client = VaultManager.get_client()
            if not client.is_authenticated():
                print("Vault: not authenticated (missing or invalid VAULT_TOKEN)")
                return None
            vault_role = _request_role_to_vault_role(role)
            # Generate credentials for the fixed role (no per-request role creation)
            creds = client.secrets.database.generate_credentials(name=vault_role)
            if not creds or "data" not in creds:
                return None
            data = creds["data"]
            return {
                "username": data["username"],
                "password": data["password"],
                "lease_id": creds.get("lease_id"),
                "lease_duration": creds.get("lease_duration"),
            }
        except Exception as e:
            print(f"Vault error: {e}")
            return None

    @staticmethod
    def revoke_credentials(lease_id: str) -> bool:
        """Revoke a lease (e.g. when access is revoked early)."""
        try:
            client = VaultManager.get_client()
            client.sys.revoke_lease(lease_id)
            return True
        except Exception as e:
            print(f"Vault revoke error: {e}")
            return False
