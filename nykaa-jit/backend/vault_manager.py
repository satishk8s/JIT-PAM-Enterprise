"""
Vault manager for JIT database credentials.
- create_database_credentials(role): uses fixed roles jit-l1/jit-l2/jit-l3 (legacy).
- create_database_credentials_dynamic(...): creates a Vault role on the fly with naming
  d-<username>-jit-<request_id_short>, and GRANTs Bedrock-suggested permissions. The DB
  user is created by Vault with {{name}} (Vault-generated); the role name follows the convention.
"""
import hvac
import os
import re


def _request_role_to_vault_role(role: str) -> str:
    """Map PAM request role to Vault database role name (legacy fixed roles)."""
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


def _sanitize_role_name(s: str, max_len: int = 64) -> str:
    """Sanitize for Vault path: alphanumeric and hyphen only."""
    if not s:
        return "user"
    s = re.sub(r"[^a-zA-Z0-9\-]", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:max_len] or "user"


def _permissions_to_grant(permissions) -> str:
    """Turn permissions string or list into MySQL GRANT clause."""
    if isinstance(permissions, list):
        perms = [p.strip().upper() for p in permissions if p and str(p).strip()]
    else:
        perms = [p.strip().upper() for p in str(permissions or "SELECT").split(",") if p.strip()]
    if not perms:
        perms = ["SELECT"]
    if "ALL" in perms or "ALL PRIVILEGES" in perms:
        return "ALL PRIVILEGES"
    return ", ".join(perms)


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
    def create_database_credentials_dynamic(
        user_email: str,
        request_id: str,
        permissions,
        db_name: str,
        duration_hours: int = 2,
    ):
        """
        Create a Vault database role on the fly with naming d-<username>-jit-<short_id>,
        then generate credentials. The MySQL user is created by Vault ({{name}}); the role
        name in Vault follows the convention. db_name is used in GRANT ON db_name.*.
        """
        try:
            client = VaultManager.get_client()
            if not client.is_authenticated():
                print("Vault: not authenticated (missing or invalid VAULT_TOKEN)")
                return None
            # Role name: d-<user>-jit-<short_request_id> (Vault path-safe)
            username_part = (user_email or "user").split("@")[0].replace(".", "-")
            username_part = _sanitize_role_name(username_part, 32)
            short_id = (request_id or "")[:8].replace("-", "") or "0"
            role_name = f"d-{username_part}-jit-{short_id}"
            grant_clause = _permissions_to_grant(permissions)
            db = (db_name or "mydb").strip()
            # creation_statements: Vault will substitute {{name}} and {{password}}
            creation_statements = [
                f"CREATE USER '{{{{name}}}}'@'%' IDENTIFIED BY '{{{{password}}}}'; "
                f"GRANT {grant_clause} ON `{db}`.* TO '{{{{name}}}}'@'%';"
            ]
            ttl_h = str(duration_hours) + "h"
            max_ttl_h = "24h"
            client.secrets.database.create_role(
                name=role_name,
                db_name="rds1",
                creation_statements=creation_statements,
                default_ttl=ttl_h,
                max_ttl=max_ttl_h,
            )
            creds = client.secrets.database.generate_credentials(name=role_name)
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
            print(f"Vault dynamic role error: {e}")
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
