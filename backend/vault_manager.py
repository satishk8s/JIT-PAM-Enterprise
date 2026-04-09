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

import boto3
import base64
import json
import os
import re
import ssl
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest


class VaultManager:
    _cached_tokens = {}
    _cached_secret_values = {}
    _cache_lock = threading.Lock()

    @staticmethod
    def _normalize_plane(plane: str) -> str:
        raw = str(plane or "").strip().lower()
        if raw in ("prod", "production"):
            return "prod"
        if raw in ("sandbox",):
            return "sandbox"
        if raw in ("nonprod", "non-prod", "non_prod", "dev", "staging", "test"):
            return "nonprod"
        return ""

    @staticmethod
    def _plane_env_keys(name: str, plane: str) -> list[str]:
        p = VaultManager._normalize_plane(plane)
        if p == "prod":
            return [f"{name}_PROD", f"{name}_PRODUCTION"]
        if p == "sandbox":
            return [f"{name}_SANDBOX"]
        if p == "nonprod":
            return [f"{name}_NONPROD", f"{name}_NON_PROD", f"{name}_DEV"]
        return []

    @staticmethod
    def _env(name: str, plane: str = "") -> str:
        for key in VaultManager._plane_env_keys(name, plane):
            value = str(os.getenv(key, "")).strip()
            if value:
                return value
        return str(os.getenv(name, "")).strip()

    @staticmethod
    def _bool_env(name: str, plane: str = "", default: bool = False) -> bool:
        raw = VaultManager._env(name, plane)
        if not raw:
            return default
        return raw.strip().lower() in ("1", "true", "yes", "on")

    @staticmethod
    def _aws_region(plane: str = "") -> str:
        return (
            VaultManager._env("AWS_REGION", plane)
            or VaultManager._env("AWS_DEFAULT_REGION", plane)
            or "ap-south-1"
        )

    @staticmethod
    def _max_duration_hours(plane: str = "") -> int:
        normalized = VaultManager._normalize_plane(plane)
        return 120 if normalized in ("nonprod", "sandbox") else 72

    @staticmethod
    def _max_duration_hours_for_request(plane: str = "", request_role: str = "", allowed_ops=None) -> int:
        normalized = VaultManager._normalize_plane(plane)
        if normalized not in ("nonprod", "sandbox"):
            return 72
        role = str(request_role or "").strip().lower()
        if role == "read_only":
            return 720
        if role in ("read_limited_write", "read_full_write", "admin"):
            return 120
        ops = [str(item or "").strip().upper() for item in (allowed_ops or []) if str(item or "").strip()]
        read_only_ops = {"SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "ANALYZE", "FIND", "AGGREGATE"}
        if ops and all(op in read_only_ops for op in ops):
            return 720
        return 120

    @staticmethod
    def _redshift_terminate_active_sessions_enabled(plane: str = "") -> bool:
        return VaultManager._bool_env("VAULT_REDSHIFT_TERMINATE_ACTIVE_SESSIONS", plane, default=True)

    @staticmethod
    def _redshift_terminate_active_session_statements(plane: str = "") -> list[str]:
        """
        Best-effort session termination for revoked Redshift users.

        This is enabled by default so admin revoke/expiry can cut off already-open
        SQL sessions, not just future reconnects. If a cluster rejects this in the
        Vault revocation context, operators can disable it with
        VAULT_REDSHIFT_TERMINATE_ACTIVE_SESSIONS=false.
        """
        if not VaultManager._redshift_terminate_active_sessions_enabled(plane):
            return []
        return [
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '{{name}}' AND pid <> pg_backend_pid();",
        ]

    @staticmethod
    def _get_secret_value(secret_name: str, plane: str = "") -> str:
        cache_key = f"{VaultManager._cache_key_for_plane(plane)}::{secret_name}"
        with VaultManager._cache_lock:
            cached = VaultManager._cached_secret_values.get(cache_key)
        if cached:
            return cached

        sm = boto3.client("secretsmanager", region_name=VaultManager._aws_region(plane))
        resp = sm.get_secret_value(SecretId=secret_name)
        secret = str(resp.get("SecretString") or "").strip()
        if not secret:
            raise RuntimeError(f"Secrets Manager secret {secret_name} is empty")
        with VaultManager._cache_lock:
            VaultManager._cached_secret_values[cache_key] = secret
        return secret

    @staticmethod
    def _env_or_secret(name: str, plane: str = "") -> str:
        direct = VaultManager._env(name, plane)
        if direct:
            return direct
        secret_name = VaultManager._env(f"{name}_SECRET_NAME", plane)
        if secret_name:
            return VaultManager._get_secret_value(secret_name, plane)
        return ""

    @staticmethod
    def _vault_addr(plane: str = "") -> str:
        return str(VaultManager._env("VAULT_ADDR", plane)).rstrip("/")

    @staticmethod
    def _vault_namespace(plane: str = "") -> str:
        return str(VaultManager._env("VAULT_NAMESPACE", plane)).strip()

    @staticmethod
    def _vault_auth_method(plane: str = "") -> str:
        raw = str(VaultManager._env("VAULT_AUTH_METHOD", plane) or "approle").strip().lower()
        return raw if raw in ("approle", "aws") else "approle"

    @staticmethod
    def _vault_aws_role(plane: str = "") -> str:
        return str(VaultManager._env("VAULT_AWS_ROLE", plane)).strip()

    @staticmethod
    def _vault_aws_iam_server_id(plane: str = "") -> str:
        return str(VaultManager._env("VAULT_AWS_IAM_SERVER_ID", plane)).strip()

    @staticmethod
    def _vault_aws_sts_region(plane: str = "") -> str:
        return (
            str(VaultManager._env("VAULT_AWS_IAM_REGION", plane)).strip()
            or "us-east-1"
        )

    @staticmethod
    def _vault_aws_sts_endpoint(plane: str = "") -> str:
        explicit = str(VaultManager._env("VAULT_AWS_IAM_STS_ENDPOINT", plane)).strip()
        if explicit:
            return explicit
        region = VaultManager._vault_aws_sts_region(plane)
        if region == "us-east-1":
            return "https://sts.amazonaws.com/"
        return f"https://sts.{region}.amazonaws.com/"

    @staticmethod
    def _vault_ssl_context(plane: str = ""):
        if VaultManager._bool_env("VAULT_SKIP_VERIFY", plane, default=False):
            if str(os.getenv("FLASK_ENV") or "").strip().lower() == "production":
                raise RuntimeError("VAULT_SKIP_VERIFY cannot be enabled in production")
            print("WARNING: VAULT_SKIP_VERIFY is enabled; Vault TLS verification is disabled.", flush=True)
            return ssl._create_unverified_context()

        ca_path = (
            VaultManager._env("VAULT_CACERT", plane)
            or VaultManager._env("VAULT_CA_CERT", plane)
            or ""
        ).strip()
        if ca_path:
            return ssl.create_default_context(cafile=ca_path)
        return None

    @staticmethod
    def _cache_key_for_plane(plane: str = "") -> str:
        norm = VaultManager._normalize_plane(plane)
        return norm or "default"

    @staticmethod
    def _http_json(
        method: str,
        url: str,
        token: str | None,
        body: dict | None = None,
        timeout: int = 8,
        namespace: str | None = None,
        plane: str = "",
    ) -> dict:
        headers = {
            "Content-Type": "application/json",
        }
        ns = str(namespace if namespace is not None else VaultManager._vault_namespace()).strip()
        if ns:
            headers["X-Vault-Namespace"] = ns
        if token:
            headers["X-Vault-Token"] = token

        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url=url, data=data, headers=headers, method=method.upper())
        ssl_context = VaultManager._vault_ssl_context(plane)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as resp:
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
    def _get_service_token(plane: str = "") -> str:
        """
        Get a Vault token for NPAMX backend.

        Supported auth methods:
        - AppRole (VAULT_ROLE_ID + VAULT_SECRET_ID)
        - AWS IAM (VAULT_AWS_ROLE, using the instance role credentials)

        Security:
        - Never use a root token.
        """
        now = time.time()
        cache_key = VaultManager._cache_key_for_plane(plane)
        with VaultManager._cache_lock:
            cached = VaultManager._cached_tokens.get(cache_key) or {}
        if cached.get("token") and now < float(cached.get("exp_epoch") or 0):
            return str(cached.get("token"))

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        auth_method = VaultManager._vault_auth_method(plane)

        if auth_method == "aws":
            aws_role = VaultManager._vault_aws_role(plane)
            if not aws_role:
                raise RuntimeError(
                    "Vault AWS auth not configured. Set VAULT_AWS_ROLE and VAULT_AUTH_METHOD=aws."
                )
            resp = VaultManager._vault_aws_login(addr=addr, namespace=namespace, plane=plane, role=aws_role)
        else:
            role_id = VaultManager._env_or_secret("VAULT_ROLE_ID", plane)
            secret_id = VaultManager._env_or_secret("VAULT_SECRET_ID", plane)
            if not (role_id and secret_id):
                raise RuntimeError(
                    "Vault AppRole auth not configured. Set VAULT_ROLE_ID and VAULT_SECRET_ID "
                    "(or *_SECRET_NAME envs backed by Secrets Manager)."
                )

            url = f"{addr}/v1/auth/approle/login"
            resp = VaultManager._http_json(
                "POST",
                url,
                token=None,
                body={"role_id": role_id, "secret_id": secret_id},
                namespace=namespace,
                plane=plane,
            )
        auth = resp.get("auth") or {}
        token = str(auth.get("client_token") or "").strip()
        lease = int(auth.get("lease_duration") or 0)
        if not token:
            if auth_method == "aws":
                raise RuntimeError("Vault AWS IAM login returned no client_token")
            raise RuntimeError("Vault AppRole login returned no client_token")

        # Best-effort reject root tokens (defense-in-depth).
        # If lookup-self is not permitted by policy, proceed (AppRole is still required),
        # but strongly recommend removing any root policy from the AppRole.
        try:
            lookup = VaultManager._http_json(
                "GET",
                f"{addr}/v1/auth/token/lookup-self",
                token=token,
                body=None,
                namespace=namespace,
                plane=plane,
            )
            policies = (lookup.get("data") or {}).get("policies") or []
            token_policies = (lookup.get("data") or {}).get("token_policies") or []
            combined = {str(p).strip().lower() for p in (policies + token_policies) if str(p).strip()}
            if "root" in combined:
                raise RuntimeError("Refusing to use a Vault token with 'root' policy")
        except RuntimeError as exc:
            msg = str(exc or "").lower()
            if not any(marker in msg for marker in ("permission denied", "vault http 403", "forbidden")):
                raise

        # Cache slightly under TTL
        with VaultManager._cache_lock:
            VaultManager._cached_tokens[cache_key] = {
                "token": token,
                "exp_epoch": time.time() + max(30, lease - 30),
            }
        return token

    @staticmethod
    def _vault_aws_login(*, addr: str, namespace: str, plane: str, role: str) -> dict:
        sts_region = VaultManager._vault_aws_sts_region(plane)
        server_id = VaultManager._vault_aws_iam_server_id(plane)
        session = boto3.Session(region_name=sts_region)
        creds = session.get_credentials()
        if creds is None:
            raise RuntimeError("Vault AWS auth could not find instance IAM credentials")
        frozen = creds.get_frozen_credentials()
        if not frozen or not getattr(frozen, "access_key", "") or not getattr(frozen, "secret_key", ""):
            raise RuntimeError("Vault AWS auth received incomplete instance IAM credentials")

        sts_endpoint = VaultManager._vault_aws_sts_endpoint(plane)
        request_body = "Action=GetCallerIdentity&Version=2011-06-15"
        parsed = urllib.parse.urlparse(sts_endpoint)
        host_header = parsed.netloc or "sts.amazonaws.com"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "Host": host_header,
        }
        if server_id:
            headers["X-Vault-AWS-IAM-Server-ID"] = server_id

        request = AWSRequest(method="POST", url=sts_endpoint, data=request_body, headers=headers)
        SigV4Auth(frozen, "sts", sts_region).add_auth(request)
        signed_headers = dict(request.headers.items())

        payload = {
            "role": role,
            "iam_http_request_method": "POST",
            "iam_request_url": base64.b64encode(sts_endpoint.encode("utf-8")).decode("ascii"),
            "iam_request_body": base64.b64encode(request_body.encode("utf-8")).decode("ascii"),
            "iam_request_headers": base64.b64encode(
                json.dumps(signed_headers).encode("utf-8")
            ).decode("ascii"),
        }
        return VaultManager._http_json(
            "POST",
            f"{addr}/v1/auth/aws/login",
            token=None,
            body=payload,
            namespace=namespace,
            plane=plane,
        )

    @staticmethod
    def _mysql_privileges_from_ops(ops: list[str]) -> tuple[str, bool]:
        """
        Convert requested operations into a strict MySQL GRANT privilege string.

        Security model:
        - Grant only what was explicitly requested.
        - Never auto-expand to broader write/admin bundles.
        - Reject unsupported/high-risk operations instead of over-granting.

        Returns: (privileges_csv, with_grant_option)
        """
        normalized_ops = {
            re.sub(r"\s+", " ", str(o or "").strip().upper())
            for o in (ops or [])
            if str(o or "").strip()
        }
        if not normalized_ops:
            raise RuntimeError("At least one database operation is required")

        # Never convert admin requests into blanket DB admin.
        banned_ops = {"ALL", "ALL PRIVILEGES", "GRANT", "REVOKE"}
        requested_banned = sorted(op for op in normalized_ops if op in banned_ops)
        if requested_banned:
            raise RuntimeError(
                "Unsupported high-risk database operation(s): "
                + ", ".join(requested_banned)
                + ". Please request explicit least-privilege operations."
            )

        # Operation -> MySQL privilege mapping (strict, no broad write expansion).
        op_to_priv = {
            "SELECT": "SELECT",
            "SHOW": "SHOW VIEW",
            # EXPLAIN/DESCRIBE are read metadata/query-plan operations that require SELECT.
            "EXPLAIN": "SELECT",
            "DESCRIBE": "SELECT",
            "INSERT": "INSERT",
            "UPDATE": "UPDATE",
            "DELETE": "DELETE",
            "CREATE": "CREATE",
            "ALTER": "ALTER",
            "DROP": "DROP",
            # TRUNCATE uses DROP privilege in MySQL.
            "TRUNCATE": "DROP",
            # RENAME TABLE requires ALTER privilege.
            "RENAME": "ALTER",
            "CREATE INDEX": "INDEX",
            "DROP INDEX": "INDEX",
            "EXECUTE": "EXECUTE",
            "CALL": "EXECUTE",
            "LOCK": "LOCK TABLES",
            "UNLOCK": "LOCK TABLES",
        }

        unsupported = sorted(op for op in normalized_ops if op not in op_to_priv)
        if unsupported:
            raise RuntimeError(
                "Unsupported operation(s) for MySQL least-privilege grants: "
                + ", ".join(unsupported)
            )

        requested = {op_to_priv[op] for op in normalized_ops}
        order = ["SELECT", "SHOW VIEW", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "INDEX", "EXECUTE", "LOCK TABLES"]
        privs = [p for p in order if p in requested]
        if not privs:
            raise RuntimeError("No MySQL privileges could be derived from requested operations")
        return ", ".join(privs), False

    @staticmethod
    def _postgres_privileges_from_ops(ops: list[str]) -> tuple[list[str], bool]:
        """
        Convert requested operations into strict PostgreSQL table privileges.

        Returns: (table_privileges, include_execute)
        """
        normalized_ops = {
            re.sub(r"\s+", " ", str(o or "").strip().upper())
            for o in (ops or [])
            if str(o or "").strip()
        }
        if not normalized_ops:
            raise RuntimeError("At least one database operation is required")

        banned_ops = {"ALL", "ALL PRIVILEGES", "GRANT", "REVOKE"}
        requested_banned = sorted(op for op in normalized_ops if op in banned_ops)
        if requested_banned:
            raise RuntimeError(
                "Unsupported high-risk database operation(s): "
                + ", ".join(requested_banned)
                + ". Please request explicit least-privilege operations."
            )

        op_to_table_priv = {
            "SELECT": "SELECT",
            # EXPLAIN/DESCRIBE are read metadata/query-plan operations that require SELECT.
            "SHOW": "SELECT",
            "EXPLAIN": "SELECT",
            "DESCRIBE": "SELECT",
            "INSERT": "INSERT",
            "UPDATE": "UPDATE",
            "DELETE": "DELETE",
            "TRUNCATE": "TRUNCATE",
        }
        exec_ops = {"EXECUTE", "CALL"}
        schema_ops = {"USAGE"}

        unsupported = sorted(op for op in normalized_ops if (op not in op_to_table_priv and op not in exec_ops and op not in schema_ops))
        if unsupported:
            raise RuntimeError(
                "Unsupported operation(s) for PostgreSQL least-privilege grants: "
                + ", ".join(unsupported)
            )

        table_privs = {op_to_table_priv[op] for op in normalized_ops if op in op_to_table_priv}
        include_execute = bool(normalized_ops & exec_ops)

        if not table_privs and not include_execute and not (normalized_ops & schema_ops):
            raise RuntimeError("No PostgreSQL privileges could be derived from requested operations")

        order = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]
        return [p for p in order if p in table_privs], include_execute

    @staticmethod
    def _normalize_user_fragment(value: str) -> str:
        s = str(value or "").strip().lower()
        if "@" in s:
            s = s.split("@", 1)[0]
        s = re.sub(r"[^a-z0-9]+", "_", s)
        s = re.sub(r"_+", "_", s).strip("_")
        if not s or s == "email":
            return "user"
        return s

    @staticmethod
    def _normalize_redshift_user_fragment(value: str) -> str:
        s = str(value or "").strip().lower()
        if "@" in s:
            s = s.split("@", 1)[0]
        s = re.sub(r"[^a-z0-9.]+", "-", s)
        s = re.sub(r"-+", "-", s).strip("-.")
        if not s or s == "email":
            return "user"
        return s

    @staticmethod
    def _short_request_fragment(request_id: str, length: int = 4) -> str:
        cleaned = re.sub(r"[^a-z0-9]", "", str(request_id or "").lower())
        frag = cleaned[: max(1, int(length or 4))]
        return frag or "req1"

    @staticmethod
    def _compact_user_fragment_for_username(value: str, max_len: int) -> str:
        """
        Build a compact, readable username fragment from requester identity.

        Examples:
        - satish.korra -> satish-korr
        - first.middle.last -> first-last
        """
        limit = max(3, int(max_len or 12))
        raw = re.sub(r"[^a-z0-9._-]+", "-", str(value or "").strip().lower()).strip("-")
        parts = [p for p in re.split(r"[-_.]+", raw) if p]
        if not parts:
            return "user"
        if len(parts) == 1:
            compact = parts[0][:limit]
        else:
            first = parts[0][: max(3, min(6, limit - 3))]
            remaining = max(3, limit - len(first) - 1)
            last = parts[-1][:remaining]
            compact = f"{first}-{last}"
        compact = re.sub(r"[^a-z0-9-]+", "-", compact).strip("-")
        return compact[:limit].rstrip("-") or "user"

    @staticmethod
    def _role_name_for(*, requester: str, request_id: str, engine: str) -> str:
        """
        Generate a short per-request Vault role name.

        MySQL usernames are often derived from RoleName via the Vault connection
        username_template, so keep this short enough to fit patterns like:
        d-{{.RoleName}}
        """
        eng = str(engine or "").lower()
        is_pg_family = ("postgres" in eng) or ("redshift" in eng)
        max_rendered_len = 63 if is_pg_family else 32
        prefix_len = 4 if "redshift" in eng else 2
        # Reserve the username prefix used by the Vault connection username_template.
        role_max = max_rendered_len - prefix_len
        rid_frag = VaultManager._short_request_fragment(request_id, 4)
        if "redshift" in eng:
            user_frag = VaultManager._normalize_redshift_user_fragment(requester)
        else:
            base_frag = VaultManager._normalize_user_fragment(requester).replace("_", "-")
            user_frag = VaultManager._compact_user_fragment_for_username(base_frag, 12)
        suffix = f"-{rid_frag}"
        if not user_frag:
            base = f"req{suffix}"
        else:
            user_max = max(3, role_max - len(suffix))
            base = f"{user_frag[:user_max].rstrip('-') or 'user'}{suffix}"
        return re.sub(r"[^a-zA-Z0-9_.-]+", "-", base)[:role_max].rstrip("-") or f"req-{rid_frag}"

    @staticmethod
    def _static_audit_role_name(connection_name: str) -> str:
        raw = str(connection_name or "").strip().lower()
        safe = re.sub(r"[^a-z0-9_.-]+", "-", raw).strip("-")
        return f"npamx-audit-{safe or 'default'}"

    @staticmethod
    def _username_template_for(*, requester: str, request_id: str, engine: str) -> str:
        """
        Generate a Vault `username_template` that embeds the requester identity.

        Target format (example): d-<user>-<rid4>
        Must respect engine identifier limits (MySQL users: 32 chars; Postgres: 63).
        """
        eng = str(engine or "").lower()
        rid_frag = VaultManager._short_request_fragment(request_id, 4)
        is_redshift = "redshift" in eng
        if is_redshift:
            user_frag = VaultManager._normalize_redshift_user_fragment(requester)
            prefix = "dwh-"
        else:
            base_frag = VaultManager._normalize_user_fragment(requester).replace("_", "-")
            user_frag = VaultManager._compact_user_fragment_for_username(base_frag, 12)
            prefix = "d-"
        max_len = 63 if ("postgres" in eng or is_redshift) else 32
        suffix = f"-{rid_frag}"
        user_max = max(3, max_len - len(prefix) - len(suffix))
        user_part = user_frag[:user_max].rstrip("-") or "user"
        return f"{prefix}{user_part}{suffix}"[:max_len].rstrip("-")

    @staticmethod
    def preview_database_username(*, requester: str, request_id: str, engine: str) -> str:
        """
        Return the deterministic DB username NPAMX expects Vault to generate for the
        per-request role. This is used for IAM policy construction before credentials
        are minted, especially for Redshift where we want the useful access window to
        start after permission-set assignment finishes.
        """
        return VaultManager._username_template_for(
            requester=requester,
            request_id=request_id,
            engine=engine,
        )

    @staticmethod
    def _resolve_connection_name(engine: str, plane: str = "", db_instance_id: str = "") -> str:
        def _safe_slug(value: str) -> str:
            return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")

        def _load_connection_map() -> dict:
            raw = VaultManager._env("VAULT_DB_CONNECTION_NAME_MAP", plane)
            if not raw:
                return {}
            try:
                parsed = json.loads(raw)
            except Exception:
                return {}
            if not isinstance(parsed, dict):
                return {}
            result = {}
            for k, v in parsed.items():
                key = str(k or "").strip().lower()
                val = str(v or "").strip()
                if key and val:
                    result[key] = val
            return result

        eng = str(engine or "").strip().lower()
        db_instance_id = str(db_instance_id or "").strip()
        connection_map = _load_connection_map()
        if db_instance_id:
            dbi_lower = db_instance_id.lower()
            dbi_slug = _safe_slug(db_instance_id)
            # Optional explicit per-instance env keys.
            for key in (
                f"VAULT_DB_CONNECTION_NAME_BY_INSTANCE_{dbi_slug.upper()}",
                f"VAULT_DB_CONNECTION_NAME_INSTANCE_{dbi_slug.upper()}",
            ):
                value = VaultManager._env(key, plane)
                if value:
                    return value
            # JSON map keys supported:
            #   "<db_instance_id>"
            #   "instance:<db_instance_id>"
            #   "<engine>:<db_instance_id>"
            for mk in (
                dbi_lower,
                f"instance:{dbi_lower}",
                f"{eng}:{dbi_lower}",
            ):
                value = connection_map.get(mk)
                if value:
                    return value

        plane_norm = VaultManager._normalize_plane(plane)
        candidates = []
        if "postgres" in eng:
            candidates.extend([
                "VAULT_DB_CONNECTION_NAME_POSTGRES",
                "VAULT_DB_CONNECTION_NAME_POSTGRESQL",
            ])
            default_base = "postgres"
        elif "redshift" in eng:
            candidates.extend([
                "VAULT_DB_CONNECTION_NAME_REDSHIFT",
                "VAULT_DB_CONNECTION_NAME_DWH",
            ])
            default_base = "redshift"
        else:
            candidates.extend([
                "VAULT_DB_CONNECTION_NAME_MYSQL",
                "VAULT_DB_CONNECTION_NAME_MARIADB",
            ])
            default_base = "mysql"

        for key in candidates:
            value = VaultManager._env(key, plane)
            if value:
                return value

        generic = VaultManager._env("VAULT_DB_CONNECTION_NAME", plane)
        if generic:
            return generic

        if plane_norm:
            return f"{plane_norm}-{default_base}"
        return f"default-{default_base}"

    @staticmethod
    def list_database_connections(plane: str = "") -> list[str]:
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultManager._get_service_token(plane)
        candidate_calls = [
            ("LIST", f"{addr}/v1/{mount}/config"),
            ("LIST", f"{addr}/v1/{mount}/config/"),
            ("GET", f"{addr}/v1/{mount}/config?list=true"),
            ("GET", f"{addr}/v1/{mount}/config/?list=true"),
        ]
        last_error = None
        for method, url in candidate_calls:
            try:
                response = VaultManager._http_json(method, url, token=token, body=None, namespace=namespace, plane=plane)
                keys = ((response.get("data") or {}).get("keys") or []) if isinstance(response, dict) else []
                normalized = sorted([str(item or "").strip().rstrip("/") for item in keys if str(item or "").strip()])
                if normalized:
                    return normalized
            except Exception as exc:
                last_error = exc
        if last_error:
            raise last_error
        return []

    @staticmethod
    def read_database_connection(connection_name: str, plane: str = "") -> dict:
        name = str(connection_name or "").strip()
        if not name:
            raise RuntimeError("connection_name is required")
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultManager._get_service_token(plane)
        safe_name = urllib.parse.quote(name, safe="")
        url = f"{addr}/v1/{mount}/config/{safe_name}"
        response = VaultManager._http_json("GET", url, token=token, body=None, namespace=namespace, plane=plane)
        return (response.get("data") or {}) if isinstance(response, dict) else {}

    @staticmethod
    def read_kv_secret(*, secret_ref: str, plane: str = "", kv_version: int = 2) -> dict:
        ref = str(secret_ref or "").strip().strip("/")
        if not ref:
            raise RuntimeError("secret_ref is required")
        parts = ref.split("/", 1)
        if len(parts) != 2:
            raise RuntimeError("secret_ref must be in '<mount>/<path>' format")
        mount = str(parts[0] or "").strip().strip("/")
        rel = str(parts[1] or "").strip().strip("/")
        if not mount or not rel:
            raise RuntimeError("secret_ref must include both mount and path")
        if rel.startswith("data/"):
            rel = rel[5:]
        elif rel.startswith("metadata/"):
            rel = rel[9:]

        version = 2
        try:
            version = int(kv_version)
        except Exception:
            version = 2
        if version not in (1, 2):
            raise RuntimeError(f"Unsupported kv_version={version}; allowed values are 1 or 2")

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        token = VaultManager._get_service_token(plane)
        safe_rel = "/".join(urllib.parse.quote(seg, safe="") for seg in rel.split("/") if seg)
        if not safe_rel:
            raise RuntimeError("secret_ref path is empty after normalization")
        if version == 2:
            url = f"{addr}/v1/{mount}/data/{safe_rel}"
            response = VaultManager._http_json("GET", url, token=token, body=None, namespace=namespace, plane=plane)
            data = (response.get("data") or {}) if isinstance(response, dict) else {}
            return (data.get("data") or {}) if isinstance(data, dict) else {}
        url = f"{addr}/v1/{mount}/{safe_rel}"
        response = VaultManager._http_json("GET", url, token=token, body=None, namespace=namespace, plane=plane)
        return (response.get("data") or {}) if isinstance(response, dict) else {}

    @staticmethod
    def upsert_database_connection(
        *,
        connection_name: str,
        plugin_name: str,
        connection_url: str,
        admin_username: str,
        admin_password: str,
        allowed_roles: str | list[str] = "*",
        username_template: str = "",
        max_open_connections: int = 4,
        max_idle_connections: int = 0,
        max_connection_lifetime: str = "0s",
        verify_connection: bool = True,
        plane: str = "",
    ) -> dict:
        name = str(connection_name or "").strip()
        if not name:
            raise RuntimeError("connection_name is required")
        plugin = str(plugin_name or "").strip()
        if not plugin:
            raise RuntimeError("plugin_name is required")
        conn_url = str(connection_url or "").strip()
        if not conn_url:
            raise RuntimeError("connection_url is required")
        username = str(admin_username or "").strip()
        if not username:
            raise RuntimeError("admin_username is required")
        password = str(admin_password or "").strip()
        if not password:
            raise RuntimeError("admin_password is required")

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultManager._get_service_token(plane)
        safe_name = urllib.parse.quote(name, safe="")
        url = f"{addr}/v1/{mount}/config/{safe_name}"

        try:
            max_open = int(max_open_connections)
        except Exception:
            max_open = 4
        if max_open < 1:
            max_open = 1
        try:
            max_idle = int(max_idle_connections)
        except Exception:
            max_idle = 0
        if max_idle < 0:
            max_idle = 0

        body = {
            "plugin_name": plugin,
            "allowed_roles": allowed_roles if isinstance(allowed_roles, list) else str(allowed_roles or "*").strip() or "*",
            "connection_url": conn_url,
            "username": username,
            "password": password,
            "max_open_connections": max_open,
            "max_idle_connections": max_idle,
            "max_connection_lifetime": str(max_connection_lifetime or "0s").strip() or "0s",
            "verify_connection": bool(verify_connection),
        }
        if str(username_template or "").strip():
            body["username_template"] = str(username_template).strip()

        response = VaultManager._http_json(
            "POST",
            url,
            token=token,
            body=body,
            namespace=namespace,
            plane=plane,
        )
        return (response.get("data") or {}) if isinstance(response, dict) else {}

    @staticmethod
    def update_database_connection_allowed_roles(
        *,
        connection_name: str,
        allowed_roles: str | list[str] = "*",
        plane: str = "",
    ) -> dict:
        """
        Update only `allowed_roles` on an existing Vault database/config connection.

        This path intentionally avoids pushing DB admin credentials from NPAMX.
        """
        name = str(connection_name or "").strip()
        if not name:
            raise RuntimeError("connection_name is required")

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultManager._get_service_token(plane)
        safe_name = urllib.parse.quote(name, safe="")
        url = f"{addr}/v1/{mount}/config/{safe_name}"
        body = {
            "allowed_roles": allowed_roles if isinstance(allowed_roles, list) else str(allowed_roles or "*").strip() or "*",
        }
        response = VaultManager._http_json(
            "POST",
            url,
            token=token,
            body=body,
            namespace=namespace,
            plane=plane,
        )
        return (response.get("data") or {}) if isinstance(response, dict) else {}

    @staticmethod
    def create_database_session(
        *,
        request_id: str,
        engine: str,
        db_names,
        db_instance_id: str = "",
        connection_name: str = "",
        schema_name: str = "",
        table_names=None,
        allowed_ops: list[str],
        duration_hours: int,
        request_role: str = "",
        requester: str = "",
        auth_type: str = "password",
        plane: str = "",
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
        schema_name = str(schema_name or "").strip()
        if isinstance(table_names, str):
            table_names = [table_names]
        table_names = [str(name or "").strip() for name in (table_names or []) if str(name or "").strip()]
        try:
            duration_hours = int(duration_hours)
        except Exception:
            duration_hours = 2
        max_duration_hours = VaultManager._max_duration_hours_for_request(plane, request_role, allowed_ops)
        if duration_hours < 1:
            duration_hours = 1
        if duration_hours > max_duration_hours:
            duration_hours = max_duration_hours

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)

        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        engine_l = str(engine or "").lower()
        # Per-request Vault role name (Vault config object).
        #
        # Keep it short and traceable (user + request-id fragment). This matters because
        # Vault's DB username templating often derives from RoleName and DB engines like
        # MySQL have strict identifier limits (32 chars).
        role_name = VaultManager._role_name_for(requester=requester, request_id=rid, engine=engine_l)

        connection = str(connection_name or "").strip() or VaultManager._resolve_connection_name(engine_l, plane, db_instance_id=db_instance_id)
        auth_l = str(auth_type or "password").strip().lower()
        use_iam_auth = auth_l == "iam"
        if "redshift" in engine_l:
            db_name = db_names[0]
            table_privs, _include_execute = VaultManager._postgres_privileges_from_ops(allowed_ops or [])
            table_privs_csv = ", ".join(table_privs) if table_privs else ""
            resolved_schema = schema_name or "public"
            table_grants = []
            if table_privs_csv:
                if table_names:
                    table_grants = [
                        f"GRANT {table_privs_csv} ON TABLE {resolved_schema}.\"{table_name}\" TO \"{{{{name}}}}\";"
                        for table_name in table_names
                    ]
                else:
                    table_grants = [
                        f"GRANT {table_privs_csv} ON ALL TABLES IN SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} GRANT {table_privs_csv} ON TABLES TO \"{{{{name}}}}\";",
                    ]
            if use_iam_auth:
                creation_statements = [
                    "CREATE USER \"{{name}}\" PASSWORD DISABLE VALID UNTIL '{{expiration}}';",
                    f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    *table_grants,
                ]
            else:
                creation_statements = [
                    "CREATE USER \"{{name}}\" PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
                    f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    *table_grants,
                ]
            revocation_statements = []
            if table_names:
                revocation_statements.extend([
                    f"REVOKE ALL PRIVILEGES ON TABLE {resolved_schema}.\"{table_name}\" FROM \"{{{{name}}}}\";"
                    for table_name in table_names
                ])
            revocation_statements.extend([
                f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
                f"REVOKE USAGE, CREATE ON SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
                *VaultManager._redshift_terminate_active_session_statements(plane),
                "DROP USER IF EXISTS \"{{name}}\";",
            ])
        elif "postgres" in engine_l:
            db_name = db_names[0]
            table_privs, include_execute = VaultManager._postgres_privileges_from_ops(allowed_ops or [])
            table_privs_csv = ", ".join(table_privs) if table_privs else ""
            resolved_schema = schema_name or "public"
            table_grants = []
            if table_privs_csv:
                if table_names:
                    table_grants = [
                        f"GRANT {table_privs_csv} ON TABLE {resolved_schema}.\"{table_name}\" TO \"{{{{name}}}}\";"
                        for table_name in table_names
                    ]
                else:
                    table_grants = [
                        f"GRANT {table_privs_csv} ON ALL TABLES IN SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} GRANT {table_privs_csv} ON TABLES TO \"{{{{name}}}}\";",
                    ]
            execute_grants = []
            if include_execute:
                execute_grants = [
                    f"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} GRANT EXECUTE ON FUNCTIONS TO \"{{{{name}}}}\";",
                ]
            if use_iam_auth:
                creation_statements = [
                    "CREATE ROLE \"{{name}}\" WITH LOGIN;",
                    # RDS IAM auth for Postgres requires membership in rds_iam.
                    "GRANT rds_iam TO \"{{name}}\";",
                    f"GRANT CONNECT ON DATABASE \"{db_name}\" TO \"{{{{name}}}}\";",
                    f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    *table_grants,
                    *execute_grants,
                ]
            else:
                # Note: Postgres uses "role" as a user; Vault will create a user with a password.
                creation_statements = [
                    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
                    f"GRANT CONNECT ON DATABASE \"{db_name}\" TO \"{{{{name}}}}\";",
                    f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    *table_grants,
                    *execute_grants,
                ]
            revocation_statements = []
            if not table_names:
                revocation_statements.extend([
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} REVOKE ALL PRIVILEGES ON TABLES FROM \"{{{{name}}}}\";",
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} REVOKE ALL PRIVILEGES ON FUNCTIONS FROM \"{{{{name}}}}\";",
                    f"REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
                    f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
                ])
            else:
                revocation_statements.extend([
                    f"REVOKE ALL PRIVILEGES ON TABLE {resolved_schema}.\"{table_name}\" FROM \"{{{{name}}}}\";"
                    for table_name in table_names
                ])
            revocation_statements.extend([
                f"REVOKE USAGE ON SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
                f"REVOKE CONNECT ON DATABASE \"{db_name}\" FROM \"{{{{name}}}}\";",
                "DROP ROLE IF EXISTS \"{{name}}\";"
            ])
        else:
            # Default: MySQL/MariaDB/Aurora style
            privs_csv, with_grant = VaultManager._mysql_privileges_from_ops(allowed_ops or [])
            grant_opt = " WITH GRANT OPTION" if with_grant else ""
            if use_iam_auth:
                # IAM auth: DB user authenticates via AWSAuthenticationPlugin (token as password).
                creation_statements = [
                    "CREATE USER '{{name}}'@'%' IDENTIFIED WITH AWSAuthenticationPlugin as 'RDS';",
                    *[f"GRANT {privs_csv} ON `{db_name}`.* TO '{{{{name}}}}'@'%'{grant_opt};" for db_name in db_names],
                ]
            else:
                # Use backticks for db name and include IDENTIFIED BY so Vault controls password.
                creation_statements = [
                    "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
                    *[f"GRANT {privs_csv} ON `{db_name}`.* TO '{{{{name}}}}'@'%'{grant_opt};" for db_name in db_names],
                ]
            revocation_statements = [
                "DROP USER IF EXISTS '{{name}}'@'%';",
            ]

        token = VaultManager._get_service_token(plane)

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
            namespace=namespace,
            plane=plane,
        )

        # 2) Generate one set of credentials for this session.
        creds_url = f"{addr}/v1/{mount}/creds/{role_name}"
        creds = VaultManager._http_json("GET", creds_url, token=token, body=None, namespace=namespace, plane=plane)
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        # Store the full lease_id returned by Vault so revocation uses the exact handle.
        # Do not truncate; revoke must use this exact string for sys/leases/revoke.
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
            "vault_plane": VaultManager._normalize_plane(plane) or "default",
        }

    @staticmethod
    def refresh_redshift_database_role(
        *,
        role_name: str,
        request_id: str,
        db_names,
        db_instance_id: str = "",
        connection_name: str = "",
        schema_name: str = "",
        table_names=None,
        allowed_ops: list[str],
        duration_hours: int,
        request_role: str = "",
        requester: str = "",
        auth_type: str = "password",
        plane: str = "",
    ) -> dict:
        """
        Re-write an existing Redshift Vault DB role with the latest creation and
        revocation statements. This lets admin revoke / expiry cleanup repair older
        request-scoped roles before the lease is revoked.
        """
        rid = str(request_id or "").strip()
        rn = str(role_name or "").strip()
        if not rid:
            raise RuntimeError("request_id is required")
        if not rn:
            raise RuntimeError("role_name is required")
        if isinstance(db_names, str):
            db_names = [db_names]
        db_names = [str(n or "").strip() for n in (db_names or []) if str(n or "").strip()]
        if not db_names:
            raise RuntimeError("db_names is required")
        schema_name = str(schema_name or "").strip()
        if isinstance(table_names, str):
            table_names = [table_names]
        table_names = [str(name or "").strip() for name in (table_names or []) if str(name or "").strip()]
        try:
            duration_hours = int(duration_hours)
        except Exception:
            duration_hours = 2
        max_duration_hours = VaultManager._max_duration_hours_for_request(plane, request_role, allowed_ops)
        if duration_hours < 1:
            duration_hours = 1
        if duration_hours > max_duration_hours:
            duration_hours = max_duration_hours

        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        connection = str(connection_name or "").strip() or VaultManager._resolve_connection_name("redshift", plane, db_instance_id=db_instance_id)
        auth_l = str(auth_type or "password").strip().lower()
        use_iam_auth = auth_l == "iam"
        db_name = db_names[0]
        table_privs, _include_execute = VaultManager._postgres_privileges_from_ops(allowed_ops or [])
        table_privs_csv = ", ".join(table_privs) if table_privs else ""
        resolved_schema = schema_name or "public"
        table_grants = []
        if table_privs_csv:
            if table_names:
                table_grants = [
                    f"GRANT {table_privs_csv} ON TABLE {resolved_schema}.\"{table_name}\" TO \"{{{{name}}}}\";"
                    for table_name in table_names
                ]
            else:
                table_grants = [
                    f"GRANT {table_privs_csv} ON ALL TABLES IN SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {resolved_schema} GRANT {table_privs_csv} ON TABLES TO \"{{{{name}}}}\";",
                ]
        if use_iam_auth:
            creation_statements = [
                "CREATE USER \"{{name}}\" PASSWORD DISABLE VALID UNTIL '{{expiration}}';",
                f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                *table_grants,
            ]
        else:
            creation_statements = [
                "CREATE USER \"{{name}}\" PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
                f"GRANT USAGE ON SCHEMA {resolved_schema} TO \"{{{{name}}}}\";",
                *table_grants,
            ]
        revocation_statements = []
        if table_names:
            revocation_statements.extend([
                f"REVOKE ALL PRIVILEGES ON TABLE {resolved_schema}.\"{table_name}\" FROM \"{{{{name}}}}\";"
                for table_name in table_names
            ])
        revocation_statements.extend([
            f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
            f"REVOKE USAGE, CREATE ON SCHEMA {resolved_schema} FROM \"{{{{name}}}}\";",
            *VaultManager._redshift_terminate_active_session_statements(plane),
            "DROP USER IF EXISTS \"{{name}}\";",
        ])

        token = VaultManager._get_service_token(plane)
        role_url = f"{addr}/v1/{mount}/roles/{rn}"
        VaultManager._http_json(
            "POST",
            role_url,
            token=token,
            body={
                "db_name": connection,
                "creation_statements": creation_statements,
                "revocation_statements": revocation_statements,
                "username_template": VaultManager._username_template_for(
                    requester=requester,
                    request_id=rid,
                    engine="redshift",
                ),
                "default_ttl": f"{duration_hours}h",
                "max_ttl": f"{duration_hours}h",
            },
            namespace=namespace,
            plane=plane,
        )
        return {
            "vault_role_name": rn,
            "db_name": db_name,
            "schema_name": resolved_schema,
            "table_names": table_names,
        }

    @staticmethod
    def create_database_connection_test_session(
        *,
        request_id: str,
        engine: str,
        requester: str = "",
        connection_name: str = "",
        preferred_role_name: str = "",
        plane: str = "",
    ) -> dict:
        """
        Mint a short-lived read-only test user for MySQL-family engines and return credentials.

        This is used only for admin integration testing and is revoked immediately after the probe.
        """
        rid = str(request_id or "").strip()
        if not rid:
            raise RuntimeError("request_id is required")
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        engine_l = str(engine or "").strip().lower()
        is_mysql = any(token in engine_l for token in ("mysql", "maria", "aurora"))
        is_postgres = "postgres" in engine_l
        if not (is_mysql or is_postgres):
            raise RuntimeError("DB connection test currently supports MySQL and PostgreSQL engines only.")

        connection = str(connection_name or "").strip() or VaultManager._resolve_connection_name(engine_l, plane)
        role_base_raw = str(preferred_role_name or os.getenv("VAULT_DB_CONNECTION_TEST_ROLE_NAME") or "npamx").strip()
        role_base = re.sub(r"[^A-Za-z0-9_.-]+", "-", role_base_raw).strip("-") or "npamx"
        conn_slug = re.sub(r"[^a-z0-9]+", "-", str(connection or "").lower()).strip("-")
        role_name = f"{role_base}-{conn_slug}" if conn_slug else role_base
        if len(role_name) > 64:
            role_name = role_name[:64].rstrip("-")
        connection_cfg = {}
        try:
            connection_cfg = VaultManager.read_database_connection(connection, plane=plane)
        except Exception:
            connection_cfg = {}

        def _allowed_role_list(raw) -> list[str]:
            if isinstance(raw, list):
                return [str(item or "").strip() for item in raw if str(item or "").strip()]
            text = str(raw or "").strip()
            if not text:
                return []
            return [part.strip() for part in text.split(",") if part.strip()]

        allowed_role_items = _allowed_role_list((connection_cfg or {}).get("allowed_roles"))
        allows_any_role = not allowed_role_items or "*" in allowed_role_items
        preferred_existing_role = ""
        if not allows_any_role:
            preferred_existing_role = str(allowed_role_items[0] or "").strip()
        creation_statements = []
        revocation_statements = []
        if is_mysql:
            creation_statements = [
                "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
                "GRANT SELECT, SHOW VIEW ON *.* TO '{{name}}'@'%';",
            ]
            revocation_statements = [
                "DROP USER IF EXISTS '{{name}}'@'%';",
            ]
        else:
            db_name = "postgres"
            conn_url = str((connection_cfg or {}).get("connection_url") or "").strip()
            if not conn_url and isinstance((connection_cfg or {}).get("connection_details"), dict):
                conn_url = str(((connection_cfg or {}).get("connection_details") or {}).get("connection_url") or "").strip()
            if conn_url:
                parsed = urllib.parse.urlparse(conn_url if "://" in conn_url else f"postgresql://{conn_url}")
                db_candidate = str(parsed.path or "").strip().lstrip("/")
                if db_candidate:
                    db_name = db_candidate
            safe_db = re.sub(r'[^A-Za-z0-9_]+', '', db_name) or "postgres"
            creation_statements = [
                "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
                f"GRANT CONNECT ON DATABASE {safe_db} TO \"{{{{name}}}}\";",
                "GRANT USAGE ON SCHEMA public TO \"{{name}}\";",
                "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";",
            ]
            revocation_statements = [
                "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";",
                "REVOKE USAGE ON SCHEMA public FROM \"{{name}}\";",
                f"REVOKE CONNECT ON DATABASE {safe_db} FROM \"{{{{name}}}}\";",
                "DROP ROLE IF EXISTS \"{{name}}\";",
            ]

        token = VaultManager._get_service_token(plane)
        safe_connection = str(connection or "").strip()

        def _list_database_roles() -> list[str]:
            candidate_calls = [
                ("LIST", f"{addr}/v1/{mount}/roles"),
                ("LIST", f"{addr}/v1/{mount}/roles/"),
                ("GET", f"{addr}/v1/{mount}/roles?list=true"),
                ("GET", f"{addr}/v1/{mount}/roles/?list=true"),
            ]
            last_error = None
            for method, url in candidate_calls:
                try:
                    response = VaultManager._http_json(method, url, token=token, body=None, namespace=namespace, plane=plane)
                    keys = ((response.get("data") or {}).get("keys") or []) if isinstance(response, dict) else []
                    normalized = sorted([str(item or "").strip().rstrip("/") for item in keys if str(item or "").strip()])
                    if normalized:
                        return normalized
                except Exception as exc:
                    last_error = exc
            if last_error:
                raise last_error
            return []

        def _find_existing_role_for_connection() -> str:
            if not safe_connection:
                return ""
            try:
                roles = _list_database_roles()
            except Exception:
                return ""
            preferred_matches = []
            fallback_matches = []
            for role in roles:
                role_name_local = str(role or "").strip()
                if not role_name_local:
                    continue
                try:
                    role_url_local = f"{addr}/v1/{mount}/roles/{urllib.parse.quote(role_name_local, safe='')}"
                    role_resp = VaultManager._http_json("GET", role_url_local, token=token, body=None, namespace=namespace, plane=plane)
                    role_data = (role_resp.get("data") or {}) if isinstance(role_resp, dict) else {}
                    role_db_name = str(role_data.get("db_name") or "").strip()
                    if role_db_name == safe_connection:
                        if role_name_local.lower().startswith(role_base.lower()):
                            preferred_matches.append(role_name_local)
                        else:
                            fallback_matches.append(role_name_local)
                except Exception:
                    continue
            if preferred_matches:
                return sorted(preferred_matches)[0]
            if fallback_matches:
                return sorted(fallback_matches)[0]
            return ""

        role_name_for_creds = role_name
        session_kind = "temporary_role"
        role_body = {
            "db_name": connection,
            "creation_statements": creation_statements,
            "revocation_statements": revocation_statements,
            "username_template": VaultManager._username_template_for(requester=requester, request_id=rid, engine=engine_l),
            "default_ttl": "15m",
            "max_ttl": "15m",
        }

        def _create_temporary_role() -> None:
            role_url_local = f"{addr}/v1/{mount}/roles/{role_name}"
            VaultManager._http_json(
                "POST",
                role_url_local,
                token=token,
                body=role_body,
                namespace=namespace,
                plane=plane,
            )

        if allows_any_role:
            try:
                _create_temporary_role()
            except Exception as exc:
                low = str(exc or "").strip().lower()
                if "not an allowed role" in low:
                    fallback_role = preferred_existing_role or _find_existing_role_for_connection()
                    if not fallback_role:
                        raise
                    role_name_for_creds = fallback_role
                    session_kind = "existing_role"
                else:
                    raise
        elif preferred_existing_role:
            role_name_for_creds = preferred_existing_role
            session_kind = "existing_role"
        else:
            fallback_role = _find_existing_role_for_connection()
            if fallback_role:
                role_name_for_creds = fallback_role
                session_kind = "existing_role"
            else:
                _create_temporary_role()

        creds_url = f"{addr}/v1/{mount}/creds/{role_name_for_creds}"
        creds = VaultManager._http_json("GET", creds_url, token=token, body=None, namespace=namespace, plane=plane)
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        lease_id = str(creds.get("lease_id") or "").strip()
        lease_duration = int(creds.get("lease_duration") or 0)
        if not db_username or not lease_id:
            raise RuntimeError("Vault did not return dynamic DB credentials")
        if not db_password:
            raise RuntimeError("Vault did not return a database password")

        expires_at = (datetime.now() + timedelta(minutes=15)).isoformat()
        return {
            "vault_role_name": role_name_for_creds,
            "db_username": db_username,
            "vault_token": db_password,
            "lease_id": lease_id,
            "lease_duration": lease_duration,
            "expires_at": expires_at,
            "vault_plane": VaultManager._normalize_plane(plane) or "default",
            "session_kind": session_kind,
            "connection_name": connection,
        }

    @staticmethod
    def create_database_user_audit_session(
        *,
        request_id: str,
        engine: str,
        requester: str = "",
        connection_name: str = "",
        plane: str = "",
    ) -> dict:
        """
        Mint a short-lived user that can read mysql.user for admin inventory checks.

        This is intentionally limited to MySQL-family engines for now.
        """
        rid = str(request_id or "").strip()
        if not rid:
            raise RuntimeError("request_id is required")
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        engine_l = str(engine or "").strip().lower()
        if not any(token in engine_l for token in ("mysql", "maria", "aurora")):
            raise RuntimeError("DB user inventory currently supports MySQL-family engines only.")

        role_name = VaultManager._role_name_for(requester=requester, request_id=rid, engine=engine_l)
        connection = str(connection_name or "").strip() or VaultManager._resolve_connection_name(engine_l, plane)
        creation_statements = [
            "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
            "GRANT SELECT, SHOW VIEW, PROCESS ON *.* TO '{{name}}'@'%';",
            "GRANT SELECT, SHOW VIEW ON `mysql`.* TO '{{name}}'@'%';",
        ]
        revocation_statements = [
            "DROP USER IF EXISTS '{{name}}'@'%';",
        ]

        token = VaultManager._get_service_token(plane)
        role_url = f"{addr}/v1/{mount}/roles/{role_name}"
        VaultManager._http_json(
            "POST",
            role_url,
            token=token,
            body={
                "db_name": connection,
                "creation_statements": creation_statements,
                "revocation_statements": revocation_statements,
                "username_template": VaultManager._username_template_for(requester=requester, request_id=rid, engine=engine_l),
                "default_ttl": "15m",
                "max_ttl": "15m",
            },
            namespace=namespace,
            plane=plane,
        )

        creds = VaultManager._http_json(
            "GET",
            f"{addr}/v1/{mount}/creds/{role_name}",
            token=token,
            body=None,
            namespace=namespace,
            plane=plane,
        )
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        lease_id = str(creds.get("lease_id") or "").strip()
        lease_duration = int(creds.get("lease_duration") or 0)
        if not db_username or not db_password or not lease_id:
            raise RuntimeError("Vault did not return temporary DB audit credentials")
        expires_at = (datetime.now() + timedelta(minutes=15)).isoformat()
        return {
            "vault_role_name": role_name,
            "db_username": db_username,
            "vault_token": db_password,
            "lease_id": lease_id,
            "lease_duration": lease_duration,
            "expires_at": expires_at,
            "vault_plane": VaultManager._normalize_plane(plane) or "default",
        }

    @staticmethod
    def read_static_database_audit_session(
        *,
        connection_name: str,
        plane: str = "",
    ) -> dict:
        """
        Read credentials from a fixed static audit role for a DB connection.

        Role naming convention:
          npamx-audit-<connection_name>
        """
        connection = str(connection_name or "").strip()
        if not connection:
            raise RuntimeError("connection_name is required")
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        role_name = VaultManager._static_audit_role_name(connection)
        token = VaultManager._get_service_token(plane)
        url = f"{addr}/v1/{mount}/static-creds/{urllib.parse.quote(role_name, safe='')}"
        creds = VaultManager._http_json(
            "GET",
            url,
            token=token,
            body=None,
            namespace=namespace,
            plane=plane,
        )
        data = creds.get("data") or {}
        db_username = str(data.get("username") or "").strip()
        db_password = str(data.get("password") or "").strip()
        if not db_username or not db_password:
            raise RuntimeError(f"Vault static audit role {role_name} did not return usable credentials")
        return {
            "vault_role_name": role_name,
            "db_username": db_username,
            "vault_token": db_password,
            "lease_id": "",
            "lease_duration": int(creds.get("lease_duration") or 0),
            "expires_at": "",
            "vault_plane": VaultManager._normalize_plane(plane) or "default",
            "session_kind": "static",
        }

    @staticmethod
    def create_or_read_database_user_audit_session(
        *,
        request_id: str,
        engine: str,
        requester: str = "",
        connection_name: str = "",
        plane: str = "",
    ) -> dict:
        """
        Prefer a fixed static audit role per connection; fall back to a dynamic
        short-lived role when the static role is not configured yet.
        """
        try:
            return VaultManager.read_static_database_audit_session(
                connection_name=connection_name,
                plane=plane,
            )
        except Exception as exc:
            low = str(exc or "").strip().lower()
            missing_markers = (
                "code: 404",
                "no value found",
                "unsupported path",
                "does not exist",
            )
            if not any(marker in low for marker in missing_markers):
                raise
        session = VaultManager.create_database_user_audit_session(
            request_id=request_id,
            engine=engine,
            requester=requester,
            connection_name=connection_name,
            plane=plane,
        )
        session["session_kind"] = "dynamic"
        return session

    @staticmethod
    def delete_database_role(role_name: str, plane: str = "") -> bool:
        """Best-effort deletion of the Vault DB role (not required for TTL cleanup)."""
        rn = str(role_name or "").strip()
        if not rn:
            return False
        addr = VaultManager._vault_addr(plane)
        if not addr:
            raise RuntimeError("VAULT_ADDR is not set")
        namespace = VaultManager._vault_namespace(plane)
        mount = VaultManager._env("VAULT_DB_MOUNT", plane) or "database"
        token = VaultManager._get_service_token(plane)
        url = f"{addr}/v1/{mount}/roles/{rn}"
        try:
            VaultManager._http_json("DELETE", url, token=token, body=None, namespace=namespace, plane=plane)
            return True
        except Exception as exc:
            low = str(exc or "").strip().lower()
            # Role is already absent; treat as successful cleanup.
            if "404" in low or "no value found" in low or "not found" in low:
                return True
            raise

    @staticmethod
    def revoke_lease(lease_id: str, plane: str = "") -> bool:
        """Revoke a lease by full lease_id (e.g. database/creds/role/uuid). Returns True on success."""
        lid = str(lease_id or "").strip()
        if not lid:
            return False
        addr = VaultManager._vault_addr(plane)
        namespace = VaultManager._vault_namespace(plane)
        token = VaultManager._get_service_token(plane)
        url = f"{addr}/v1/sys/leases/revoke"
        VaultManager._http_json("POST", url, token=token, body={"lease_id": lid}, namespace=namespace, plane=plane)
        return True
