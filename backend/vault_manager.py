"""
Vault Manager (HTTP client, no extra deps)
=========================================

This module intentionally avoids `hvac` so the backend can run with a minimal
Python environment.

NPAMX uses Vault's Database Secrets Engine to mint short-lived DB credentials.
For this phase, the "vault token" shown to the user is the Vault-generated
database password for the dynamic user (time-bound and revoked by Vault).
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta


class VaultManager:
    _cached_token = None
    _cached_token_exp = 0  # epoch seconds

    @staticmethod
    def _vault_addr() -> str:
        return str(os.getenv("VAULT_ADDR", "")).rstrip("/")

    @staticmethod
    def _vault_namespace() -> str:
        return str(os.getenv("VAULT_NAMESPACE", "")).strip()

    @staticmethod
    def _env(name: str) -> str:
        return str(os.getenv(name, "")).strip()

    @staticmethod
    def _http_json(method: str, url: str, token: str | None, body: dict | None = None, timeout: int = 8) -> dict:
        headers = {
            "Content-Type": "application/json",
        }
        ns = VaultManager._vault_namespace()
        if ns:
            headers["X-Vault-Namespace"] = ns
        if token:
            headers["X-Vault-Token"] = token

        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url=url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = ""
            try:
                raw = e.read().decode("utf-8")
            except Exception:
                pass
            raise RuntimeError(f"Vault HTTP {e.code}: {raw or e.reason}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Vault connection failed: {e}") from e

    @staticmethod
    def _get_service_token() -> str:
        """
        Get a Vault token for NPAMX backend.

        Required: AppRole (VAULT_ROLE_ID + VAULT_SECRET_ID)

        Security:
        - Never use a root token.
        """
        now = time.time()
        if VaultManager._cached_token and now < VaultManager._cached_token_exp:
            return VaultManager._cached_token

        addr = VaultManager._vault_addr()
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")

        role_id = VaultManager._env("VAULT_ROLE_ID")
        secret_id = VaultManager._env("VAULT_SECRET_ID")
        if not (role_id and secret_id):
            raise RuntimeError("Vault AppRole auth not configured. Set VAULT_ROLE_ID and VAULT_SECRET_ID.")

        url = f"{addr}/v1/auth/approle/login"
        resp = VaultManager._http_json("POST", url, token=None, body={"role_id": role_id, "secret_id": secret_id})
        auth = resp.get("auth") or {}
        token = str(auth.get("client_token") or "").strip()
        lease = int(auth.get("lease_duration") or 0)
        if not token:
            raise RuntimeError("Vault AppRole login returned no client_token")

        # Best-effort reject root tokens (defense-in-depth).
        # If lookup-self is not permitted by policy, proceed (AppRole is still required),
        # but strongly recommend removing any root policy from the AppRole.
        try:
            lookup = VaultManager._http_json("GET", f"{addr}/v1/auth/token/lookup-self", token=token, body=None)
            policies = (lookup.get("data") or {}).get("policies") or []
            token_policies = (lookup.get("data") or {}).get("token_policies") or []
            combined = {str(p).strip().lower() for p in (policies + token_policies) if str(p).strip()}
            if "root" in combined:
                raise RuntimeError("Refusing to use a Vault token with 'root' policy")
        except Exception:
            pass

        # Cache slightly under TTL
        VaultManager._cached_token = token
        VaultManager._cached_token_exp = time.time() + max(30, lease - 30)
        return token

    @staticmethod
    def _mysql_privileges_from_ops(ops: list[str]) -> tuple[str, bool]:
        """
        Convert structured operations into a MySQL GRANT privilege string.

        Returns: (privileges_csv, with_grant_option)
        """
        up = {str(o or "").strip().upper() for o in (ops or []) if str(o or "").strip()}

        # Read-ish operations
        read_ops = {"SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "ANALYZE"}
        # Write operations
        write_ops = {"INSERT", "UPDATE", "DELETE", "MERGE"}
        # Schema operations
        schema_ops = {"CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "CREATE INDEX", "DROP INDEX"}
        # Privilege operations
        priv_ops = {"GRANT", "REVOKE"}
        # Admin-ish
        admin_ops = {"EXECUTE", "CALL", "LOCK", "UNLOCK"}

        requested = set()
        with_grant_option = False

        if up & read_ops:
            requested.add("SELECT")
        if up & {"SHOW"}:
            # SHOW VIEW allows SHOW CREATE VIEW; safe default for visibility (optional)
            requested.add("SHOW VIEW")
        if up & write_ops:
            requested.update({"INSERT", "UPDATE", "DELETE"})
        if up & schema_ops:
            # MySQL doesn't have granular TRUNCATE privilege; TRUNCATE requires DROP.
            requested.update({"CREATE", "ALTER", "DROP"})
            if ("CREATE INDEX" in up) or ("DROP INDEX" in up):
                requested.add("INDEX")
        if up & admin_ops:
            # Stored routines
            if ("EXECUTE" in up) or ("CALL" in up):
                requested.add("EXECUTE")
            if ("LOCK" in up) or ("UNLOCK" in up):
                requested.add("LOCK TABLES")
        if up & priv_ops:
            # Highly privileged; require WITH GRANT OPTION.
            requested.add("ALL PRIVILEGES")
            with_grant_option = True

        if "ALL PRIVILEGES" in requested:
            return "ALL PRIVILEGES", with_grant_option

        # Stable ordering for readability/debugging
        order = ["SELECT", "SHOW VIEW", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "INDEX", "EXECUTE", "LOCK TABLES"]
        privs = [p for p in order if p in requested]
        if not privs:
            privs = ["SELECT"]
        return ", ".join(privs), with_grant_option

    @staticmethod
    def _normalize_user_fragment(value: str) -> str:
        s = str(value or "").strip().lower()
        if "@" in s:
            s = s.split("@", 1)[0]
        s = re.sub(r"[^a-z0-9]+", "_", s)
        s = re.sub(r"_+", "_", s).strip("_")
        return s or "user"

    @staticmethod
    def _username_template_for(*, requester: str, request_id: str, engine: str) -> str:
        """
        Generate a Vault `username_template` that embeds the requester identity.

        Target format (example): d_<user>_<rid>_<rand>
        Must respect engine identifier limits (MySQL users: 32 chars; Postgres: 63).
        """
        user_frag = VaultManager._normalize_user_fragment(requester)[:12]
        rid_clean = re.sub(r"[^a-z0-9]", "", str(request_id or "").lower())
        rid_short = (rid_clean[:8] or "req")

        eng = str(engine or "").lower()
        max_len = 63 if "postgres" in eng else 32

        # Keep a small random suffix to avoid collisions if creds are minted more than once.
        rand_len = 4
        suffix = f"_{{{{random {rand_len}}}}}"

        base = f"d_{user_frag}_{rid_short}"
        base_max = max_len - len(suffix)
        if base_max < 1:
            base = base[: max_len]
            return base
        if len(base) > base_max:
            base = base[:base_max].rstrip("_")
        return base + suffix

    @staticmethod
    def create_database_session(
        *,
        request_id: str,
        engine: str,
        db_names,
        allowed_ops: list[str],
        duration_hours: int,
        requester: str = "",
        auth_type: str = "password",
    ) -> dict:
        """
        Create a per-request Vault DB role and mint one set of dynamic DB credentials.

        Returns:
          {
            "vault_role_name": "...",
            "db_username": "...",
            "vault_token": "...",   # DB password (ephemeral)
            "lease_id": "...",
            "lease_duration": 7200,
            "expires_at": "ISO8601"
          }
        """
        rid = str(request_id or "").strip()
        if not rid:
            raise RuntimeError("request_id is required")
        if isinstance(db_names, str):
            db_names = [db_names]
        db_names = [str(n or "").strip() for n in (db_names or [])]
        db_names = [n for n in db_names if n]
        if not db_names:
            raise RuntimeError("db_names is required")
        try:
            duration_hours = int(duration_hours)
        except Exception:
            duration_hours = 2
        if duration_hours < 1:
            duration_hours = 1
        if duration_hours > 24:
            duration_hours = 24

        addr = VaultManager._vault_addr()
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")

        mount = VaultManager._env("VAULT_DB_MOUNT") or "database"
        # Vault DB connection name (configured in Vault). The manual setup typically names it "my-mysql".
        connection = VaultManager._env("VAULT_DB_CONNECTION_NAME") or "my-mysql"

        # Per-request Vault role name (Vault config object).
        # Updated: include requester identity for traceability.
        requester_frag = VaultManager._normalize_user_fragment(requester)[:20]
        role_name = f"jit_{requester_frag}_{rid}" if requester_frag else f"jit_{rid}"
        # Keep role names URL-safe.
        role_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", role_name)

        engine_l = str(engine or "").lower()
        auth_l = str(auth_type or "password").strip().lower()
        use_iam_auth = auth_l == "iam"
        if "postgres" in engine_l:
            db_name = db_names[0]
            # Basic Postgres grants (public schema); can be extended later.
            if use_iam_auth:
                creation_statements = [
                    "CREATE ROLE \"{{name}}\" WITH LOGIN;",
                    # RDS IAM auth for Postgres requires membership in rds_iam.
                    "GRANT rds_iam TO \"{{name}}\";",
                    f"GRANT CONNECT ON DATABASE \"{db_name}\" TO \"{{{{name}}}}\";",
                    f"GRANT USAGE ON SCHEMA public TO \"{{{{name}}}}\";",
                    f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{{{name}}}}\";",
                ]
            else:
                # Note: Postgres uses "role" as a user; Vault will create a user with a password.
                creation_statements = [
                    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
                    f"GRANT CONNECT ON DATABASE \"{db_name}\" TO \"{{{{name}}}}\";",
                    f"GRANT USAGE ON SCHEMA public TO \"{{{{name}}}}\";",
                    f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{{{name}}}}\";",
                ]
            revocation_statements = [
                "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";",
                "REVOKE USAGE ON SCHEMA public FROM \"{{name}}\";",
                f"REVOKE CONNECT ON DATABASE \"{db_name}\" FROM \"{{{{name}}}}\";",
                "DROP ROLE IF EXISTS \"{{name}}\";"
            ]
        else:
            # Default: MySQL/MariaDB/Aurora style
            privs_csv, with_grant = VaultManager._mysql_privileges_from_ops(allowed_ops or [])
            grant_opt = " WITH GRANT OPTION" if with_grant else ""
            if use_iam_auth:
                # IAM auth: DB user authenticates via AWSAuthenticationPlugin (token as password).
                creation_statements = [
                    "CREATE USER '{{name}}'@'%' IDENTIFIED WITH AWSAuthenticationPlugin as 'RDS';",
                    *[f"GRANT {privs_csv} ON `{db_name}`.* TO '{{{{name}}}}'@'%'{grant_opt};" for db_name in db_names],
                    "FLUSH PRIVILEGES;",
                ]
            else:
                # Use backticks for db name and include IDENTIFIED BY so Vault controls password.
                creation_statements = [
                    "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
                    *[f"GRANT {privs_csv} ON `{db_name}`.* TO '{{{{name}}}}'@'%'{grant_opt};" for db_name in db_names],
                    "FLUSH PRIVILEGES;",
                ]
            revocation_statements = [
                "DROP USER IF EXISTS '{{name}}'@'%';",
                "FLUSH PRIVILEGES;"
            ]

        token = VaultManager._get_service_token()

        # 1) Create/overwrite the Vault DB role (per request).
        role_url = f"{addr}/v1/{mount}/roles/{role_name}"
        VaultManager._http_json(
            "POST",
            role_url,
            token=token,
            body={
                "db_name": connection,
                "creation_statements": creation_statements,
                "revocation_statements": revocation_statements,
                # Embed requester identity into the generated DB username.
                "username_template": VaultManager._username_template_for(requester=requester, request_id=rid, engine=engine_l),
                "default_ttl": f"{duration_hours}h",
                "max_ttl": f"{duration_hours}h",
            },
        )

        # 2) Generate one set of credentials for this session.
        creds_url = f"{addr}/v1/{mount}/creds/{role_name}"
        creds = VaultManager._http_json("GET", creds_url, token=token, body=None)
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        lease_id = str(creds.get("lease_id") or "").strip()
        lease_duration = int(creds.get("lease_duration") or 0)
        if not db_username or not lease_id:
            raise RuntimeError("Vault did not return dynamic DB credentials")
        if not db_password and not use_iam_auth:
            raise RuntimeError("Vault did not return a database password")

        expires_at = (datetime.now() + timedelta(hours=duration_hours)).isoformat()
        return {
            "vault_role_name": role_name,
            "db_username": db_username,
            # For IAM auth, password is not used; an IAM token is generated on demand.
            "vault_token": "" if use_iam_auth else db_password,
            "lease_id": lease_id,
            "lease_duration": lease_duration,
            "expires_at": expires_at,
        }

    @staticmethod
    def delete_database_role(role_name: str) -> bool:
        """Best-effort deletion of the Vault DB role (not required for TTL cleanup)."""
        rn = str(role_name or "").strip()
        if not rn:
            return False
        try:
            addr = VaultManager._vault_addr()
            if not addr:
                return False
            mount = VaultManager._env("VAULT_DB_MOUNT") or "database"
            token = VaultManager._get_service_token()
            url = f"{addr}/v1/{mount}/roles/{rn}"
            VaultManager._http_json("DELETE", url, token=token, body=None)
            return True
        except Exception:
            return False

    @staticmethod
    def revoke_lease(lease_id: str) -> bool:
        """Best-effort lease revoke (not required for TTL cleanup)."""
        lid = str(lease_id or "").strip()
        if not lid:
            return False
        try:
            addr = VaultManager._vault_addr()
            token = VaultManager._get_service_token()
            url = f"{addr}/v1/sys/leases/revoke"
            VaultManager._http_json("POST", url, token=token, body={"lease_id": lid})
            return True
        except Exception:
            return False
