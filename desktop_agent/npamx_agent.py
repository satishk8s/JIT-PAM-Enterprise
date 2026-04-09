#!/usr/bin/env python3
"""NPAMX Desktop Agent (MVP).

Features:
- One-time login/configuration
- Register + heartbeat with NPAMX backend
- Cross-platform config path handling
- CLI suitable for service/task schedulers
"""

from __future__ import annotations

import argparse
import configparser
import json
import os
import platform
import re
import shutil
import socket
import ssl
import subprocess
import threading
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

try:
    import certifi  # type: ignore
except Exception:
    certifi = None

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
except Exception:
    tk = None
    ttk = None
    messagebox = None


APP_NAME = "npamx-desktop-agent"
APP_DISPLAY_NAME = "NPAMX"
APP_KEYCHAIN_SERVICE = "com.nykaa.npamx.desktop-agent"
APP_VERSION = "1.4.4"
DEFAULT_INTERVAL_SECONDS = 30
DEFAULT_TIMEOUT_SECONDS = 10
BOOTSTRAP_FILE_NAMES = (
    "npamx-agent.bootstrap.json",
    "npamx-desktop-agent.bootstrap.json",
    "npamx-agent-bootstrap.json",
)
CA_BUNDLE_FILE_NAMES = (
    "npamx-agent-ca.pem",
    "npamx-ca.pem",
    "ca-bundle.pem",
)
AWS_CLI_CANDIDATE_PATHS = (
    "/opt/homebrew/bin/aws",
    "/usr/local/bin/aws",
    "/usr/bin/aws",
    "/opt/aws-cli/bin/aws",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _config_dir() -> Path:
    sys_name = platform.system().lower()
    if sys_name.startswith("win"):
        base = os.getenv("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "NPAMXDesktopAgent"
    if sys_name == "darwin":
        return Path.home() / "Library" / "Application Support" / "NPAMXDesktopAgent"
    return Path.home() / ".config" / "npamx-desktop-agent"


def _config_path() -> Path:
    return _config_dir() / "config.json"


def _state_path() -> Path:
    return _config_dir() / "state.json"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


class _HoverTip:
    def __init__(self, widget: Any, text: str) -> None:
        self.widget = widget
        self.text = str(text or "").strip()
        self.tip = None
        self._after_id = None
        try:
            widget.bind("<Enter>", self._schedule)
            widget.bind("<Leave>", self._hide)
            widget.bind("<ButtonPress>", self._hide)
        except Exception:
            pass

    def _schedule(self, _event=None) -> None:
        self._hide()
        if not self.text:
            return
        try:
            self._after_id = self.widget.after(350, self._show)
        except Exception:
            self._after_id = None

    def _show(self) -> None:
        if self.tip is not None or not self.text:
            return
        try:
            x = self.widget.winfo_rootx() + 18
            y = self.widget.winfo_rooty() + self.widget.winfo_height() + 8
        except Exception:
            return
        tip = tk.Toplevel(self.widget)
        tip.wm_overrideredirect(True)
        tip.wm_geometry(f"+{x}+{y}")
        label = tk.Label(
            tip,
            text=self.text,
            justify="left",
            wraplength=320,
            bg="#101828",
            fg="#f8fafc",
            relief="solid",
            bd=1,
            padx=8,
            pady=6,
            font=("Arial", 9),
        )
        label.pack()
        self.tip = tip

    def _hide(self, _event=None) -> None:
        after_id = self._after_id
        self._after_id = None
        if after_id:
            try:
                self.widget.after_cancel(after_id)
            except Exception:
                pass
        if self.tip is not None:
            try:
                self.tip.destroy()
            except Exception:
                pass
            self.tip = None


def _chmod_private(path: Path) -> None:
    if platform.system().lower().startswith("win"):
        return
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def _aws_config_file() -> Path:
    return Path.home() / ".aws" / "config"


def _aws_credentials_file() -> Path:
    return Path.home() / ".aws" / "credentials"


def _load_json(path: Path, default: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        return dict(default)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return dict(default)


def _save_json(path: Path, payload: Dict[str, Any]) -> None:
    _ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _chmod_private(path)


def _secure_token_backend() -> str:
    if platform.system().lower() == "darwin" and shutil.which("security"):
        return "keychain"
    return ""


def _agent_token_account(cfg: Dict[str, Any]) -> str:
    email = str(cfg.get("user_email") or "").strip().lower()
    if email:
        return email
    agent_id = str(cfg.get("agent_id") or "").strip()
    if agent_id:
        return agent_id
    return APP_NAME


def _store_agent_token_secure(cfg: Dict[str, Any], token: str) -> bool:
    raw = str(token or "").strip()
    if not raw:
        return False
    if _secure_token_backend() != "keychain":
        return False
    try:
        proc = subprocess.run(
            [
                "security",
                "add-generic-password",
                "-a", _agent_token_account(cfg),
                "-s", APP_KEYCHAIN_SERVICE,
                "-w", raw,
                "-U",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return proc.returncode == 0
    except Exception:
        return False


def _load_agent_token_secure(cfg: Dict[str, Any]) -> str:
    if _secure_token_backend() != "keychain":
        return ""
    try:
        proc = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a", _agent_token_account(cfg),
                "-s", APP_KEYCHAIN_SERVICE,
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if proc.returncode != 0:
            return ""
        return str(proc.stdout or "").strip()
    except Exception:
        return ""


def _delete_agent_token_secure(cfg: Dict[str, Any]) -> None:
    if _secure_token_backend() != "keychain":
        return
    try:
        subprocess.run(
            [
                "security",
                "delete-generic-password",
                "-a", _agent_token_account(cfg),
                "-s", APP_KEYCHAIN_SERVICE,
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        pass


def _runtime_binary_dir() -> Path:
    if getattr(sys, "frozen", False):
        try:
            return Path(sys.executable).resolve().parent
        except Exception:
            return Path.cwd()
    try:
        return Path(sys.argv[0]).resolve().parent
    except Exception:
        return Path.cwd()


def _runtime_bundle_dir() -> Path | None:
    try:
        current = _runtime_binary_dir()
        for candidate in (current, *current.parents):
            if candidate.suffix.lower() == ".app":
                return candidate
    except Exception:
        pass
    return None


def _bootstrap_candidate_paths() -> list[Path]:
    seen = set()
    paths = []
    bundle_dir = _runtime_bundle_dir()
    base_dirs = [_runtime_binary_dir()]
    if bundle_dir is not None:
        base_dirs.append(bundle_dir)
        if bundle_dir.parent != bundle_dir:
            base_dirs.append(bundle_dir.parent)
    base_dirs.extend([Path.cwd(), _config_dir()])
    for base in base_dirs:
        for name in BOOTSTRAP_FILE_NAMES:
            candidate = base / name
            key = str(candidate)
            if key in seen:
                continue
            seen.add(key)
            paths.append(candidate)
    return paths


def _ca_bundle_candidate_paths() -> list[Path]:
    seen = set()
    paths = []
    env_candidates = (
        str(os.getenv("NPAMX_AGENT_CA_BUNDLE") or "").strip(),
        str(os.getenv("SSL_CERT_FILE") or "").strip(),
        str(os.getenv("REQUESTS_CA_BUNDLE") or "").strip(),
    )
    for raw in env_candidates:
        if not raw:
            continue
        candidate = Path(raw).expanduser()
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        paths.append(candidate)
    bundle_dir = _runtime_bundle_dir()
    base_dirs = [_runtime_binary_dir()]
    if bundle_dir is not None:
        base_dirs.append(bundle_dir)
        if bundle_dir.parent != bundle_dir:
            base_dirs.append(bundle_dir.parent)
    base_dirs.extend([Path.cwd(), _config_dir()])
    for base in base_dirs:
        for name in CA_BUNDLE_FILE_NAMES:
            candidate = base / name
            key = str(candidate)
            if key in seen:
                continue
            seen.add(key)
            paths.append(candidate)
    return paths


def _find_aws_cli() -> str:
    env_override = str(os.getenv("NPAMX_AGENT_AWS_CLI") or os.getenv("AWS_CLI_PATH") or "").strip()
    if env_override:
        candidate = Path(env_override).expanduser()
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    resolved = shutil.which("aws")
    if resolved:
        return resolved
    for raw in AWS_CLI_CANDIDATE_PATHS:
        candidate = Path(raw)
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    user_local = Path.home() / ".local" / "bin" / "aws"
    if user_local.exists() and user_local.is_file():
        return str(user_local)
    return ""


def _slugify_profile_part(value: str, *, default: str = "item", max_len: int = 24) -> str:
    raw = str(value or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    if not slug:
        slug = default
    return slug[:max_len].strip("-") or default


def _request_profile_name(session_row: Dict[str, Any], creds: Dict[str, Any] | None = None) -> str:
    ic = {}
    if isinstance(session_row.get("identity_center"), dict):
        ic = dict(session_row.get("identity_center") or {})
    if isinstance((creds or {}).get("local_token_instructions"), dict):
        local_ic = (((creds or {}).get("local_token_instructions") or {}).get("identity_center") or {})
        if isinstance(local_ic, dict):
            ic.update({k: v for k, v in local_ic.items() if v})
    account_id = str(ic.get("account_id") or session_row.get("account_id") or "").strip() or "account"
    permission_set = str(ic.get("permission_set_name") or session_row.get("iam_permission_set_name") or "").strip() or "jit"
    req_id = str(session_row.get("request_id") or "").strip()[:8] or "request"
    return f"npamx-{_slugify_profile_part(account_id, default='account', max_len=12)}-{_slugify_profile_part(permission_set, default='jit', max_len=24)}-{_slugify_profile_part(req_id, default='request', max_len=8)}"


def _request_aws_profile_record(session_row: Dict[str, Any]) -> Dict[str, str]:
    ic = session_row.get("identity_center") if isinstance(session_row.get("identity_center"), dict) else {}
    account_id = str((ic or {}).get("account_id") or session_row.get("account_id") or "").strip()
    permission_set = str((ic or {}).get("permission_set_name") or session_row.get("iam_permission_set_name") or "").strip()
    start_url = str((ic or {}).get("start_url") or "").strip()
    region = str((ic or {}).get("region") or "").strip()
    if not account_id or not permission_set or not start_url or not region:
        return {}
    profile = _request_profile_name(session_row)
    account_name = str(session_row.get("account_name") or account_id).strip()
    database_name = str(session_row.get("database") or session_row.get("db_instance_id") or "").strip()
    request_id = str(session_row.get("request_id") or "").strip()[:8]
    label_parts = [permission_set, f"{account_name} ({account_id})"]
    if database_name:
        label_parts.append(database_name)
    if request_id:
        label_parts.append(request_id)
    label = " | ".join([part for part in label_parts if str(part or "").strip()])
    return {
        "profile": profile,
        "account_id": account_id,
        "permission_set": permission_set,
        "region": region,
        "start_url": start_url,
        "label": label,
        "source": "request",
        "request_id": str(session_row.get("request_id") or "").strip(),
    }


def _ensure_aws_sso_profile(*, profile_name: str, start_url: str, sso_region: str, account_id: str, permission_set_name: str, default_region: str) -> None:
    profile = str(profile_name or "").strip()
    if not profile:
        raise RuntimeError("AWS profile name is missing.")
    if not start_url or not sso_region or not account_id or not permission_set_name:
        raise RuntimeError("Identity Center profile details are incomplete for this request.")
    config_path = _aws_config_file()
    _ensure_dir(config_path.parent)
    parser = configparser.RawConfigParser()
    try:
        if config_path.exists():
            parser.read(config_path, encoding="utf-8")
    except Exception:
        pass
    session_name = "npamx-jit"
    session_section = f"sso-session {session_name}"
    profile_section = f"profile {profile}"
    if not parser.has_section(session_section):
        parser.add_section(session_section)
    parser.set(session_section, "sso_start_url", start_url)
    parser.set(session_section, "sso_region", sso_region)
    parser.set(session_section, "sso_registration_scopes", "sso:account:access")
    if not parser.has_section(profile_section):
        parser.add_section(profile_section)
    parser.set(profile_section, "sso_session", session_name)
    parser.set(profile_section, "sso_account_id", account_id)
    parser.set(profile_section, "sso_role_name", permission_set_name)
    parser.set(profile_section, "region", str(default_region or "ap-south-1").strip() or "ap-south-1")
    parser.set(profile_section, "output", "json")
    with config_path.open("w", encoding="utf-8") as handle:
        parser.write(handle)


def _agent_ssl_context() -> ssl.SSLContext:
    for candidate in _ca_bundle_candidate_paths():
        try:
            if candidate.exists() and candidate.is_file():
                return ssl.create_default_context(cafile=str(candidate))
        except Exception:
            continue
    if certifi is not None:
        try:
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
    ctx = ssl.create_default_context()
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    return ctx


def _dbeaver_driver_id(engine: str, port: str = "") -> str:
    key = str(engine or "").strip().lower()
    port_value = str(port or "").strip()
    if key in ("mysql", "mariadb", "aurora-mysql"):
        return "mysql"
    if key in ("postgres", "postgresql", "aurora-postgresql"):
        return "postgresql"
    if key == "redshift":
        return "redshift"
    if "redshift" in key or port_value == "5439":
        return "redshift"
    if "postgres" in key or port_value == "5432":
        return "postgresql"
    if "mysql" in key or "maria" in key or "aurora" in key or port_value == "3306":
        return "mysql"
    return ""


def _dbeaver_jdbc_url(driver_id: str, host: str, port: str, database: str) -> str:
    drv = str(driver_id or "").strip().lower()
    db = str(database or "").strip()
    if drv == "mysql":
        return f"jdbc:mysql://{host}:{port}/{db}?sslMode=REQUIRED"
    if drv == "postgresql":
        return f"jdbc:postgresql://{host}:{port}/{db}?sslmode=require"
    if drv == "redshift":
        return f"jdbc:redshift://{host}:{port}/{db}?ssl=true"
    return ""


def _build_dbeaver_connection_arg(session_row: Dict[str, Any], creds: Dict[str, Any]) -> str:
    engine = str(session_row.get("engine") or creds.get("engine") or "").strip().lower()
    profile = creds.get("dbeaver_profile") if isinstance(creds.get("dbeaver_profile"), dict) else {}
    host = str(profile.get("host") or creds.get("proxy_host") or session_row.get("proxy_host") or "").strip()
    port = str(profile.get("port") or creds.get("proxy_port") or session_row.get("proxy_port") or "").strip()
    driver_id = _dbeaver_driver_id(engine, port)
    if not driver_id:
        raise RuntimeError(f"DBeaver auto-connect is not supported yet for engine '{engine or 'unknown'}'.")
    database = str(profile.get("database") or creds.get("database") or session_row.get("database") or "").strip()
    username = str(profile.get("username") or creds.get("db_username") or session_row.get("db_username") or "").strip()
    password = str(creds.get("password") or creds.get("vault_token") or "").strip()
    name = str(profile.get("name") or f"NPAMX - {session_row.get('request_id') or session_row.get('db_instance_id') or 'connection'}").strip()
    if not host or not port or not database or not username or not password:
        raise RuntimeError("DBeaver connection details are incomplete for the selected request.")
    url = _dbeaver_jdbc_url(driver_id, host, port, database)
    if not url:
        raise RuntimeError("DBeaver JDBC URL could not be prepared for this connection.")
    parts = [
        f"name={name}",
        f"driver={driver_id}",
        f"url={url}",
        f"host={host}",
        f"port={port}",
        f"database={database}",
        f"user={username}",
        f"password={password}",
        "savePassword=true",
        "create=true",
        "save=false",
        "connect=true",
        "openConsole=true",
        "folder=NPAMX JIT",
    ]
    return "|".join(parts)


def _connection_target(session_row: Dict[str, Any], creds: Dict[str, Any]) -> tuple[str, int, str]:
    profile = creds.get("dbeaver_profile") if isinstance(creds.get("dbeaver_profile"), dict) else {}
    host = str(profile.get("host") or creds.get("proxy_host") or session_row.get("proxy_host") or "").strip()
    raw_port = str(profile.get("port") or creds.get("proxy_port") or session_row.get("proxy_port") or "").strip()
    try:
        port = int(raw_port) if raw_port else 0
    except Exception:
        port = 0
    mode = str(creds.get("connect_endpoint_mode") or session_row.get("connect_endpoint_mode") or "").strip().lower()
    return host, port, mode


def _tcp_connectivity_probe(host: str, port: int, timeout_seconds: int = 5) -> tuple[bool, str]:
    target_host = str(host or "").strip()
    if not target_host or int(port or 0) <= 0:
        return False, "Connection endpoint is incomplete."
    try:
        with socket.create_connection((target_host, int(port)), timeout=float(timeout_seconds)):
            return True, ""
    except Exception as exc:
        return False, str(exc).strip() or "Connection timed out."


def _find_dbeaver_command() -> list[str]:
    system = platform.system().lower()
    if system == "darwin":
        candidates = [
            Path("/Applications/DBeaver.app/Contents/MacOS/DBeaver"),
            Path("/Applications/DBeaver.app/Contents/MacOS/dbeaver"),
            Path.home() / "Applications" / "DBeaver.app" / "Contents" / "MacOS" / "DBeaver",
            Path.home() / "Applications" / "DBeaver.app" / "Contents" / "MacOS" / "dbeaver",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return [str(candidate)]
        return ["open", "-a", "DBeaver", "--args"]
    if system.startswith("win"):
        for exe in ("dbeaverc.exe", "dbeaver.exe"):
            resolved = shutil.which(exe)
            if resolved:
                return [resolved]
        raise RuntimeError("DBeaver is not installed or not available in PATH on this machine.")
    for exe in ("dbeaver", "dbeaver-ce"):
        resolved = shutil.which(exe)
        if resolved:
            return [resolved]
    raise RuntimeError("DBeaver is not installed or not available in PATH on this machine.")


def _aws_profile_records() -> list[Dict[str, str]]:
    parser = configparser.RawConfigParser()
    for path in (_aws_config_file(), _aws_credentials_file()):
        try:
            if path.exists():
                parser.read(path, encoding="utf-8")
        except Exception:
            pass

    seen = set()
    names: list[str] = []
    cli = _find_aws_cli()
    if cli:
        try:
            proc = subprocess.run(
                [cli, "configure", "list-profiles"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            if proc.returncode == 0:
                for line in (proc.stdout or "").splitlines():
                    name = str(line or "").strip()
                    if name and name not in seen:
                        seen.add(name)
                        names.append(name)
        except Exception:
            pass
    for section in parser.sections():
        name = str(section or "").strip()
        if name.startswith("profile "):
            name = name.split("profile ", 1)[1].strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)

    records: list[Dict[str, str]] = []
    for profile in sorted(names):
        section_names = [f"profile {profile}", profile]
        section_data: Dict[str, str] = {}
        for section_name in section_names:
            if parser.has_section(section_name):
                for key, value in parser.items(section_name):
                    section_data[str(key or "").strip().lower()] = str(value or "").strip()
        account_id = str(section_data.get("sso_account_id") or section_data.get("aws_account_id") or "").strip()
        permission_set = str(section_data.get("sso_role_name") or section_data.get("role_arn") or "").strip()
        region = str(section_data.get("region") or section_data.get("sso_region") or "").strip()
        display_parts = [permission_set or profile]
        if account_id:
            display_parts.append(account_id)
        if permission_set and permission_set != profile:
            display_parts.append(profile)
        label = " | ".join(display_parts)
        if region:
            label = f"{label} [{region}]"
        records.append(
            {
                "profile": profile,
                "account_id": account_id,
                "permission_set": permission_set,
                "region": region,
                "label": label,
            }
        )
    return records


def _load_bootstrap_config() -> Dict[str, Any]:
    for candidate in _bootstrap_candidate_paths():
        if not candidate.exists():
            continue
        payload = _load_json(candidate, {})
        if not isinstance(payload, dict):
            continue
        if str(payload.get("type") or "").strip() != "npamx_desktop_agent_bootstrap":
            continue
        return {
            "bootstrap_loaded": True,
            "bootstrap_source": str(candidate),
            "server_url": _normalize_server_url(payload.get("server_url") or ""),
            "user_email": str(payload.get("user_email") or "").strip().lower(),
            "user_name": str(payload.get("user_name") or "").strip(),
            "network_scope": str(payload.get("network_scope") or "netskope").strip() or "netskope",
            "agent_version": str(payload.get("agent_version") or APP_VERSION).strip() or APP_VERSION,
        }
    return {"bootstrap_loaded": False, "bootstrap_source": ""}


def _list_aws_profiles() -> list[str]:
    return [str(item.get("profile") or "").strip() for item in _aws_profile_records() if str(item.get("profile") or "").strip()]


def _aws_cli_available() -> bool:
    return bool(_find_aws_cli())


def _aws_profile_identity(profile_name: str) -> Dict[str, Any]:
    profile = str(profile_name or "").strip()
    if not profile:
        return {"ok": False, "error": "AWS profile is required."}
    cli = _find_aws_cli()
    if not cli:
        return {"ok": False, "error": "AWS CLI is not installed on this machine."}
    try:
        proc = subprocess.run(
            [cli, "sts", "get-caller-identity", "--profile", profile, "--output", "json"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip() or "AWS session is not ready."
            return {"ok": False, "error": err}
        data = json.loads(proc.stdout or "{}")
        if not isinstance(data, dict):
            return {"ok": False, "error": "Invalid AWS CLI response."}
        return {
            "ok": True,
            "account_id": str(data.get("Account") or "").strip(),
            "arn": str(data.get("Arn") or "").strip(),
            "user_id": str(data.get("UserId") or "").strip(),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc).strip() or "AWS profile validation failed."}


def _aws_sso_login(profile_name: str) -> Dict[str, Any]:
    profile = str(profile_name or "").strip()
    if not profile:
        return {"ok": False, "error": "AWS profile is required."}
    cli = _find_aws_cli()
    if not cli:
        return {"ok": False, "error": "AWS CLI is not installed on this machine."}
    try:
        proc = subprocess.run(
            [cli, "sso", "login", "--profile", profile],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip() or "AWS SSO login failed."
            return {"ok": False, "error": err}
        return {"ok": True, "message": "AWS SSO login completed successfully."}
    except Exception as exc:
        return {"ok": False, "error": str(exc).strip() or "AWS SSO login failed."}


def _generate_iam_login_material(creds: Dict[str, Any], aws_profile: str) -> Dict[str, Any]:
    profile = str(aws_profile or "").strip()
    if not profile:
        raise RuntimeError("Select an AWS CLI profile first.")
    cli = _find_aws_cli()
    if not cli:
        raise RuntimeError("AWS CLI is not installed on this machine.")
    effective_auth = str(creds.get("effective_auth") or "").strip().lower()
    if effective_auth != "iam":
        return {
            "mode": "password",
            "username": str(creds.get("db_username") or "").strip(),
            "password": str(creds.get("password") or creds.get("vault_token") or "").strip(),
            "database": str(creds.get("database") or "").strip(),
            "host": str(creds.get("proxy_host") or "").strip(),
            "port": int(creds.get("proxy_port") or 0) if str(creds.get("proxy_port") or "").strip() else 0,
        }

    engine = str(creds.get("engine") or "").strip().lower()
    local = creds.get("local_token_instructions") if isinstance(creds.get("local_token_instructions"), dict) else {}
    region = str(local.get("region") or creds.get("region") or "").strip() or "ap-south-1"
    host = str(local.get("hostname") or creds.get("proxy_host") or "").strip()
    port = int(local.get("port") or creds.get("proxy_port") or 0) if str(local.get("port") or creds.get("proxy_port") or "").strip() else 0
    database = str(local.get("database") or creds.get("database") or "").strip()

    if engine == "redshift":
        cluster_id = str(local.get("cluster_identifier") or "").strip()
        requested_user = str(local.get("username") or creds.get("db_username") or "").strip()
        if not cluster_id or not requested_user or not database:
            raise RuntimeError("Redshift IAM details are incomplete.")
        proc = subprocess.run(
            [
                cli, "redshift", "get-cluster-credentials",
                "--cluster-identifier", cluster_id,
                "--db-user", requested_user,
                "--db-name", database,
                "--duration-seconds", "900",
                "--region", region,
                "--profile", profile,
                "--output", "json",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "").strip() or "Failed to fetch Redshift credentials.")
        payload = json.loads(proc.stdout or "{}")
        username = str(payload.get("DbUser") or requested_user).strip()
        password = str(payload.get("DbPassword") or "").strip()
        if not username or not password:
            raise RuntimeError("Redshift credentials were not returned.")
        return {
            "mode": "redshift_iam",
            "username": username,
            "password": password,
            "database": database,
            "host": host,
            "port": port,
        }

    username = str(local.get("username") or creds.get("db_username") or "").strip()
    if not host or not port or not username:
        raise RuntimeError("IAM token details are incomplete.")
    proc = subprocess.run(
        [
            cli, "rds", "generate-db-auth-token",
            "--hostname", host,
            "--port", str(port),
            "--username", username,
            "--region", region,
            "--profile", profile,
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "").strip() or "Failed to generate IAM token.")
    token = (proc.stdout or "").strip()
    if not token:
        raise RuntimeError("IAM token was empty.")
    return {
        "mode": "rds_iam",
        "username": username,
        "password": token,
        "database": database,
        "host": host,
        "port": port,
    }


def _load_config() -> Dict[str, Any]:
    cfg = _load_json(_config_path(), {})
    bootstrap = _load_bootstrap_config()
    if bootstrap.get("bootstrap_loaded"):
        for key in ("server_url", "user_email", "user_name", "network_scope", "agent_version"):
            value = str(bootstrap.get(key) or "").strip()
            if value:
                cfg[key] = value
        cfg["bootstrap_loaded"] = True
        cfg["bootstrap_source"] = str(bootstrap.get("bootstrap_source") or "").strip()
    else:
        cfg["bootstrap_loaded"] = False
        cfg["bootstrap_source"] = ""
    secure_backend = _secure_token_backend()
    if secure_backend:
        secure_token = _load_agent_token_secure(cfg)
        if secure_token:
            cfg["agent_token"] = secure_token
            cfg["agent_token_storage"] = secure_backend
        else:
            plaintext = str(cfg.get("agent_token") or "").strip()
            if plaintext and _store_agent_token_secure(cfg, plaintext):
                cfg.pop("agent_token", None)
                cfg["agent_token_storage"] = secure_backend
                _save_json(_config_path(), cfg)
            elif plaintext:
                cfg["agent_token_storage"] = "file"
    elif str(cfg.get("agent_token") or "").strip():
        cfg["agent_token_storage"] = "file"
    return cfg


def _save_config(cfg: Dict[str, Any]) -> None:
    payload = dict(cfg or {})
    raw_token = str(payload.get("agent_token") or "").strip()
    secure_backend = _secure_token_backend()
    if raw_token and secure_backend and _store_agent_token_secure(payload, raw_token):
        payload.pop("agent_token", None)
        payload["agent_token_storage"] = secure_backend
    elif raw_token:
        payload["agent_token_storage"] = "file"
    _save_json(_config_path(), payload)


def _save_state(state: Dict[str, Any]) -> None:
    _save_json(_state_path(), state)


def _merge_state(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = _load_json(_state_path(), {})
    merged = dict(current)
    merged.update(patch or {})
    if "updated_at" not in merged:
        merged["updated_at"] = _utc_now_iso()
    _save_state(merged)
    return merged


def _normalize_server_url(raw: str) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value:
        return ""
    if not value.startswith("http://") and not value.startswith("https://"):
        value = "https://" + value
    return value


def _headers(token: str = "") -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": f"{APP_NAME}/{APP_VERSION}",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _http_json(method: str, url: str, *, token: str = "", payload: Dict[str, Any] | None = None, timeout: int) -> Dict[str, Any]:
    data_bytes = None
    if payload is not None:
        data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url=url, data=data_bytes, method=method, headers=_headers(token))
    try:
        context = _agent_ssl_context() if str(urlparse(url).scheme or "").lower() == "https" else None
        with urllib.request.urlopen(req, timeout=timeout, context=context) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if not body.strip():
                return {}
            parsed = json.loads(body)
            return parsed if isinstance(parsed, dict) else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body or exc.reason}") from exc
    except ssl.SSLCertVerificationError as exc:
        raise RuntimeError(
            "TLS certificate verification failed. "
            "If your company uses an internal CA, place the PEM bundle next to the agent as "
            "'npamx-agent-ca.pem' or set NPAMX_AGENT_CA_BUNDLE."
        ) from exc
    except urllib.error.URLError as exc:
        reason = str(exc.reason or "").strip()
        if "CERTIFICATE_VERIFY_FAILED" in reason or "certificate verify failed" in reason.lower():
            raise RuntimeError(
                "TLS certificate verification failed. "
                "If your company uses an internal CA, place the PEM bundle next to the agent as "
                "'npamx-agent-ca.pem' or set NPAMX_AGENT_CA_BUNDLE."
            ) from exc
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def _agent_id(cfg: Dict[str, Any]) -> str:
    value = str(cfg.get("agent_id") or "").strip()
    if value:
        return value
    value = f"agent-{uuid.uuid4().hex[:12]}"
    cfg["agent_id"] = value
    _save_config(cfg)
    return value


def _base_payload(cfg: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "agent_id": _agent_id(cfg),
        "user_email": str(cfg.get("user_email") or "").strip().lower(),
        "user_name": str(cfg.get("user_name") or "").strip(),
        "host": str(cfg.get("host") or socket.gethostname()).strip(),
        "platform": f"{platform.system()} {platform.release()}".strip(),
        "version": str(cfg.get("agent_version") or APP_VERSION).strip(),
        "network_scope": str(cfg.get("network_scope") or "netskope").strip(),
    }


def _require_config() -> Dict[str, Any]:
    cfg = _load_config()
    server_url = _normalize_server_url(cfg.get("server_url") or "")
    token = str(cfg.get("agent_token") or "").strip()
    if not server_url or not token:
        raise RuntimeError(
            "Agent is not configured. Run login first: "
            "npamx-agent login --server-url <NPAMX_URL> --user-email <you@company.com>"
        )
    cfg["server_url"] = server_url
    return cfg


def register_agent(cfg: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    payload = _base_payload(cfg)
    url = cfg["server_url"] + "/api/agent/v1/register"
    return _http_json("POST", url, token=cfg["agent_token"], payload=payload, timeout=timeout)


def heartbeat_agent(cfg: Dict[str, Any], timeout: int, status: str = "connected", error: str = "") -> Dict[str, Any]:
    payload = _base_payload(cfg)
    payload["status"] = status
    if error:
        payload["error"] = error[:500]
    url = cfg["server_url"] + "/api/agent/v1/heartbeat"
    return _http_json("POST", url, token=cfg["agent_token"], payload=payload, timeout=timeout)


def fetch_database_sessions(cfg: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    url = cfg["server_url"] + "/api/agent/v1/database/sessions"
    return _http_json("GET", url, token=cfg["agent_token"], payload=None, timeout=timeout)


def fetch_database_session_credentials(cfg: Dict[str, Any], request_id: str, timeout: int) -> Dict[str, Any]:
    rid = str(request_id or "").strip()
    if not rid:
        raise RuntimeError("request_id is required")
    url = cfg["server_url"] + f"/api/agent/v1/database/sessions/{rid}/credentials"
    return _http_json("GET", url, token=cfg["agent_token"], payload=None, timeout=timeout)


def start_pairing(cfg: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    payload = _base_payload(cfg)
    url = cfg["server_url"] + "/api/agent/v1/login/start"
    return _http_json("POST", url, payload=payload, timeout=timeout)


def poll_pairing(cfg: Dict[str, Any], device_code: str, timeout: int) -> Dict[str, Any]:
    payload = {
        "device_code": str(device_code or "").strip(),
        "agent_id": _agent_id(cfg),
    }
    url = cfg["server_url"] + "/api/agent/v1/login/poll"
    return _http_json("POST", url, payload=payload, timeout=timeout)


def _run_one_cycle(cfg: Dict[str, Any], *, timeout: int) -> Dict[str, Any]:
    register_resp = register_agent(cfg, timeout=timeout)
    heartbeat_resp = heartbeat_agent(cfg, timeout=timeout)
    sessions_resp = {}
    try:
        sessions_resp = fetch_database_sessions(cfg, timeout=timeout)
    except Exception as exc:
        sessions_resp = {
            "status": "error",
            "error": str(exc).strip(),
            "sessions": [],
        }
    snapshot = {
        "last_action": "run_loop",
        "last_status": "success",
        "register_response": register_resp,
        "heartbeat_response": heartbeat_resp,
        "sessions_response": sessions_resp,
        "sessions": sessions_resp.get("sessions") if isinstance(sessions_resp, dict) else [],
        "updated_at": _utc_now_iso(),
    }
    _save_state(snapshot)
    return snapshot


def cmd_login(args: argparse.Namespace) -> int:
    cfg = _load_config()
    cfg.update(
        {
            "server_url": _normalize_server_url(args.server_url or cfg.get("server_url") or ""),
            "user_email": str(args.user_email or cfg.get("user_email") or "").strip().lower(),
            "user_name": str(args.user_name or cfg.get("user_name") or "").strip(),
            "host": str(args.host or socket.gethostname()).strip(),
            "network_scope": str(args.network_scope or cfg.get("network_scope") or "netskope").strip(),
            "interval_seconds": max(10, int(args.interval_seconds or DEFAULT_INTERVAL_SECONDS)),
            "timeout_seconds": max(3, int(args.timeout_seconds or DEFAULT_TIMEOUT_SECONDS)),
            "agent_version": str(args.agent_version or cfg.get("agent_version") or "1.0.0").strip(),
            "updated_at": _utc_now_iso(),
        }
    )
    if not cfg["server_url"] or not cfg["user_email"]:
        raise RuntimeError("server_url and user_email are required. Download the agent profile from NPAMX or pass them explicitly.")
    legacy_token = str(args.token or "").strip()
    if legacy_token:
        cfg["agent_token"] = legacy_token
        _save_config(cfg)
        response = register_agent(cfg, timeout=cfg["timeout_seconds"])
        _save_state(
            {
                "last_action": "login_register",
                "last_status": "success",
                "mode": "shared_token",
                "last_response": response,
                "updated_at": _utc_now_iso(),
            }
        )
        print("Login successful (shared token mode). Agent registered.")
        print(json.dumps(response, indent=2))
        return 0

    _save_config(cfg)
    start = start_pairing(cfg, timeout=cfg["timeout_seconds"])
    device_code = str(start.get("device_code") or "").strip()
    user_code = str(start.get("user_code") or "").strip()
    verify_url = str(start.get("verification_url") or cfg["server_url"]).strip()
    if not device_code or not user_code:
        raise RuntimeError("Pairing start failed: missing device_code or user_code.")

    interval = max(3, int(start.get("interval") or cfg.get("interval_seconds") or DEFAULT_INTERVAL_SECONDS))
    max_wait = max(60, int(args.pairing_timeout_seconds or 900))
    deadline = time.time() + max_wait
    print("")
    print("NPAMX Agent Identity Center login started.")
    print(f"1) Open NPAMX in browser (already signed in): {verify_url}")
    print(f"2) In Home -> Desktop Agent, paste this code and click Connect Agent: {user_code}")
    print(f"3) Waiting for approval (timeout {max_wait}s)...")

    while True:
        if time.time() > deadline:
            raise RuntimeError("Pairing timed out. Run login again and complete code approval in NPAMX.")
        poll = poll_pairing(cfg, device_code=device_code, timeout=cfg["timeout_seconds"])
        status = str(poll.get("status") or "").strip().lower()
        if status == "success":
            access_token = str(poll.get("access_token") or "").strip()
            if not access_token:
                raise RuntimeError("Pairing succeeded but no access token was returned.")
            cfg["agent_token"] = access_token
            if poll.get("user_email"):
                cfg["user_email"] = str(poll.get("user_email") or "").strip().lower()
            _save_config(cfg)
            register_response = register_agent(cfg, timeout=cfg["timeout_seconds"])
            _save_state(
                {
                    "last_action": "login_register",
                    "last_status": "success",
                    "mode": "identity_center_pairing",
                    "pairing_response": poll,
                    "register_response": register_response,
                    "updated_at": _utc_now_iso(),
                }
            )
            print("Login successful. Agent paired with Identity Center and registered.")
            print(json.dumps(register_response, indent=2))
            return 0
        code = str(poll.get("code") or "").strip()
        if status == "authorization_pending" or code == "NPAMX-AGENT-PENDING":
            print(f"[{_utc_now_iso()}] waiting for code approval...")
            time.sleep(interval)
            continue
        raise RuntimeError(f"Pairing failed: {json.dumps(poll)}")


def cmd_register(args: argparse.Namespace) -> int:
    cfg = _require_config()
    timeout = max(3, int(args.timeout_seconds or cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
    response = register_agent(cfg, timeout=timeout)
    _save_state(
        {
            "last_action": "register",
            "last_status": "success",
            "last_response": response,
            "updated_at": _utc_now_iso(),
        }
    )
    print(json.dumps(response, indent=2))
    return 0


def cmd_heartbeat(args: argparse.Namespace) -> int:
    cfg = _require_config()
    timeout = max(3, int(args.timeout_seconds or cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
    response = heartbeat_agent(cfg, timeout=timeout)
    _save_state(
        {
            "last_action": "heartbeat",
            "last_status": "success",
            "last_response": response,
            "updated_at": _utc_now_iso(),
        }
    )
    print(json.dumps(response, indent=2))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    cfg = _require_config()
    interval = max(10, int(args.interval_seconds or cfg.get("interval_seconds") or DEFAULT_INTERVAL_SECONDS))
    timeout = max(3, int(args.timeout_seconds or cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
    once = bool(args.once)
    print(f"Starting NPAMX agent loop (interval={interval}s, once={once})")
    while True:
        try:
            _run_one_cycle(cfg, timeout=timeout)
            print(f"[{_utc_now_iso()}] heartbeat ok")
        except Exception as exc:
            err_text = str(exc).strip()
            _save_state(
                {
                    "last_action": "run_loop",
                    "last_status": "error",
                    "error": err_text,
                    "updated_at": _utc_now_iso(),
                }
            )
            try:
                heartbeat_agent(cfg, timeout=timeout, status="error", error=err_text)
            except Exception:
                pass
            print(f"[{_utc_now_iso()}] heartbeat failed: {err_text}", file=sys.stderr)
        if once:
            return 0
        time.sleep(interval)


def cmd_status(_: argparse.Namespace) -> int:
    cfg = _load_config()
    state = _load_json(_state_path(), {})
    payload = {
        "config_path": str(_config_path()),
        "state_path": str(_state_path()),
        "configured": bool(cfg.get("server_url") and cfg.get("agent_token") and cfg.get("user_email")),
        "config": {
            "agent_id": cfg.get("agent_id"),
            "server_url": cfg.get("server_url"),
            "user_email": cfg.get("user_email"),
            "user_name": cfg.get("user_name"),
            "host": cfg.get("host"),
            "network_scope": cfg.get("network_scope"),
            "interval_seconds": cfg.get("interval_seconds"),
            "timeout_seconds": cfg.get("timeout_seconds"),
            "agent_version": cfg.get("agent_version"),
            "token_configured": bool(cfg.get("agent_token")),
        },
        "state": state,
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_sessions(args: argparse.Namespace) -> int:
    cfg = _require_config()
    timeout = max(3, int(args.timeout_seconds or cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
    response = fetch_database_sessions(cfg, timeout=timeout)
    _merge_state(
        {
            "last_action": "sessions",
            "last_status": "success",
            "sessions_response": response,
            "sessions": response.get("sessions") if isinstance(response, dict) else [],
            "updated_at": _utc_now_iso(),
        }
    )
    print(json.dumps(response, indent=2))
    return 0


def cmd_session_credentials(args: argparse.Namespace) -> int:
    cfg = _require_config()
    timeout = max(3, int(args.timeout_seconds or cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
    response = fetch_database_session_credentials(cfg, request_id=args.request_id, timeout=timeout)
    _merge_state(
        {
            "last_action": "session_credentials",
            "last_status": "success",
            "last_credentials_response": response,
            "updated_at": _utc_now_iso(),
        }
    )
    print(json.dumps(response, indent=2))
    return 0


def cmd_logout(_: argparse.Namespace) -> int:
    cfg = _load_config()
    _delete_agent_token_secure(cfg)
    path = _config_path()
    if path.exists():
        path.unlink()
    _save_state({"last_action": "logout", "last_status": "success", "updated_at": _utc_now_iso()})
    print("Agent configuration removed.")
    return 0


class AgentStatusWindow:
    def __init__(self) -> None:
        if tk is None or ttk is None:
            raise RuntimeError("Tkinter UI is not available in this build.")
        self.root = tk.Tk()
        self.root.title(APP_DISPLAY_NAME)
        self.root.geometry("860x620")
        self.root.minsize(760, 520)
        self.stop_event = threading.Event()
        self.loop_thread = None
        self.sessions = []

        cfg = _load_config()
        self._initial_cfg = dict(cfg or {})
        state = _load_json(_state_path(), {})

        self.server_var = tk.StringVar(value=str(cfg.get("server_url") or "").strip())
        self.email_var = tk.StringVar(value=str(cfg.get("user_email") or "").strip().lower())
        self.user_var = tk.StringVar(value=str(cfg.get("user_name") or "").strip())
        self.status_var = tk.StringVar(value="Not connected")
        self.pair_var = tk.StringVar(value="")
        self.pair_code_var = tk.StringVar(value="")
        self.summary_var = tk.StringVar(value="")
        self.session_detail_var = tk.StringVar(value="No session selected.")
        self.bootstrap_var = tk.StringVar(value="")
        self.aws_profile_var = tk.StringVar(value="")
        self.aws_search_var = tk.StringVar(value="")
        self.aws_status_var = tk.StringVar(value="")
        self.aws_profile_labels: Dict[str, str] = {}
        self.aws_profile_records: list[Dict[str, str]] = []
        self.selected_credentials = {}
        self._status_palette = {
            "success": "#0f6b2f",
            "error": "#b42318",
            "warning": "#9a3412",
            "info": "#1d4ed8",
            "muted": "#344054",
        }
        self._tooltips: list[_HoverTip] = []

        self._build_ui()
        self._load_local_state_into_ui(state=state, cfg=cfg)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(1500, self._refresh_from_server_background)

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill="both", expand=True)

        top = ttk.LabelFrame(outer, text="Agent Setup", padding=10)
        top.pack(fill="x")
        ttk.Label(top, text="Server URL").grid(row=0, column=0, sticky="w")
        self.server_entry = ttk.Entry(top, textvariable=self.server_var, width=46)
        self.server_entry.grid(row=0, column=1, sticky="ew", padx=(8, 16))
        ttk.Label(top, text="User Email").grid(row=0, column=2, sticky="w")
        self.email_entry = ttk.Entry(top, textvariable=self.email_var, width=30)
        self.email_entry.grid(row=0, column=3, sticky="ew", padx=(8, 0))
        display_name_wrap = ttk.Frame(top)
        display_name_wrap.grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Label(display_name_wrap, text="Display Name").pack(side="left")
        self._add_help_badge(display_name_wrap, "Friendly name sent with agent registration and logs. It does not grant access and is not used for authorization.")
        self.user_entry = ttk.Entry(top, textvariable=self.user_var, width=46)
        self.user_entry.grid(row=1, column=1, sticky="ew", padx=(8, 16), pady=(8, 0))
        login_wrap = ttk.Frame(top)
        login_wrap.grid(row=1, column=2, sticky="ew", pady=(8, 0))
        ttk.Button(login_wrap, text="Login", command=self._login_background).pack(side="left")
        self._add_help_badge(login_wrap, "Start the NPAMX pairing flow. The agent will show a one-time pairing code that you paste into the NPAMX UI.")
        logout_wrap = ttk.Frame(top)
        logout_wrap.grid(row=1, column=3, sticky="ew", padx=(8, 0), pady=(8, 0))
        ttk.Button(logout_wrap, text="Logout", command=self._logout).pack(side="left")
        self._add_help_badge(logout_wrap, "Remove the local agent login and stop using the current NPAMX pairing token on this machine.")
        self.bootstrap_label = tk.Label(top, textvariable=self.bootstrap_var, anchor="w", justify="left", wraplength=980, fg=self._status_palette["success"])
        self.bootstrap_label.grid(row=2, column=0, columnspan=4, sticky="w", pady=(8, 0))
        for idx in range(4):
            top.columnconfigure(idx, weight=1 if idx in (1, 3) else 0)

        controls = ttk.Frame(outer, padding=(0, 10, 0, 10))
        controls.pack(fill="x")
        self._pack_help_button(controls, "Start Agent Loop", self._start_loop, "Start the local heartbeat loop so the agent keeps reporting status to NPAMX until you stop it or close the app.")
        self._pack_help_button(controls, "Stop Loop", self._stop_loop, "Stop the background heartbeat loop without logging out.")
        self._pack_help_button(controls, "Refresh Sessions", self._refresh_from_server_background, "Fetch the latest approved active DB sessions from NPAMX for the paired user.")
        self._pack_help_button(controls, "Load Login Details", self._load_selected_credentials_background, "Fetch the login material for the selected request and show the exact connection details inside the agent.")
        self._pack_help_button(controls, "Copy Session Details", self._copy_selected_details, "Copy the selected request details from the panel so you can paste them into a ticket or chat.")
        self._pack_help_button(controls, "Connect", self._connect_selected_session_background, "Generate the required login material for the selected request and open DBeaver with the prepared connection.")

        status_frame = ttk.LabelFrame(outer, text="Status", padding=10)
        status_frame.pack(fill="x")
        self.status_label = tk.Label(status_frame, textvariable=self.status_var, font=("Arial", 11, "bold"), anchor="w", justify="left", wraplength=980, fg=self._status_palette["muted"])
        self.status_label.pack(anchor="w")
        pair_code_row = ttk.Frame(status_frame)
        pair_code_row.pack(fill="x", pady=(6, 0))
        ttk.Label(pair_code_row, text="Pairing Code").pack(side="left")
        self.pair_code_entry = ttk.Entry(pair_code_row, textvariable=self.pair_code_var, width=22, state="readonly")
        self.pair_code_entry.pack(side="left", padx=(8, 8))
        ttk.Button(pair_code_row, text="Copy Pairing Code", command=self._copy_pair_code).pack(side="left")
        self.pair_label = tk.Label(status_frame, textvariable=self.pair_var, anchor="w", justify="left", wraplength=980, fg=self._status_palette["warning"])
        self.pair_label.pack(anchor="w", pady=(6, 0))
        self.summary_label = tk.Label(status_frame, textvariable=self.summary_var, anchor="w", justify="left", wraplength=980, fg=self._status_palette["muted"])
        self.summary_label.pack(anchor="w", pady=(6, 0))

        aws_frame = ttk.LabelFrame(outer, text="AWS Session", padding=10)
        aws_frame.pack(fill="x", pady=(10, 0))
        aws_label_wrap = ttk.Frame(aws_frame)
        aws_label_wrap.grid(row=0, column=0, sticky="w")
        ttk.Label(aws_label_wrap, text="AWS Account / Permission Set").pack(side="left")
        self._add_help_badge(aws_label_wrap, "Choose the AWS SSO profile for the selected JIT request. The agent now prefers active request-linked permission sets and hides stale generated profiles.")
        self.aws_profile_combo = ttk.Combobox(aws_frame, textvariable=self.aws_profile_var, state="readonly", width=32)
        self.aws_profile_combo.grid(row=0, column=1, sticky="ew", padx=(8, 10))
        self._grid_help_button(aws_frame, 0, 2, "Refresh Profiles", self._refresh_aws_profiles, "Reload the visible AWS profiles. This re-derives active request-linked JIT permission sets and hides stale generated entries.")
        self._grid_help_button(aws_frame, 0, 3, "AWS Login", self._aws_login_background, "Open the AWS SSO browser login flow for the selected profile on this machine.")
        self._grid_help_button(aws_frame, 0, 4, "Check Session", self._check_aws_profile_background, "Verify that the selected AWS profile has a valid local session and show the active caller identity.")
        ttk.Label(aws_frame, text="Search").grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.aws_search_entry = ttk.Entry(aws_frame, textvariable=self.aws_search_var, width=32)
        self.aws_search_entry.grid(row=1, column=1, sticky="ew", padx=(8, 10), pady=(8, 0))
        self.aws_search_entry.bind("<KeyRelease>", lambda _event: self._apply_aws_profile_filter())
        self.aws_status_label = tk.Label(aws_frame, textvariable=self.aws_status_var, anchor="w", justify="left", wraplength=980, fg=self._status_palette["info"])
        self.aws_status_label.grid(row=2, column=0, columnspan=5, sticky="w", pady=(8, 0))
        for idx in range(5):
            aws_frame.columnconfigure(idx, weight=1 if idx == 1 else 0)

        mid = ttk.Panedwindow(outer, orient="horizontal")
        mid.pack(fill="both", expand=True, pady=(10, 0))

        sessions_frame = ttk.LabelFrame(mid, text="Active Database Sessions", padding=8)
        detail_frame = ttk.LabelFrame(mid, text="Selected Session", padding=8)
        mid.add(sessions_frame, weight=3)
        mid.add(detail_frame, weight=2)

        self.sessions_tree = ttk.Treeview(
            sessions_frame,
            columns=("request_id", "engine", "account", "database", "jit_set", "auth", "expires"),
            show="headings",
            height=14,
        )
        for col, title, width in (
            ("request_id", "Request", 150),
            ("engine", "Engine", 90),
            ("account", "Account", 170),
            ("database", "Database", 150),
            ("jit_set", "JIT Set / Username", 180),
            ("auth", "Auth", 90),
            ("expires", "Expires", 170),
        ):
            self.sessions_tree.heading(col, text=title)
            self.sessions_tree.column(col, width=width, anchor="w")
        self.sessions_tree.pack(fill="both", expand=True)
        self.sessions_tree.bind("<<TreeviewSelect>>", self._on_session_select)

        self.detail_text = tk.Text(detail_frame, wrap="word", height=18)
        self.detail_text.pack(fill="both", expand=True)
        self.detail_text.insert("1.0", "No session selected.")
        self.detail_text.configure(state="disabled")

        bottom = ttk.LabelFrame(outer, text="Activity Log", padding=8)
        bottom.pack(fill="both", expand=False, pady=(10, 0))
        self.log_text = tk.Text(bottom, wrap="word", height=8)
        self.log_text.pack(fill="both", expand=True)
        footer = ttk.Frame(bottom)
        footer.pack(fill="x", pady=(8, 0))
        self.version_label = tk.Label(
            footer,
            text=f"Agent Version: {str(self._initial_cfg.get('agent_version') or APP_VERSION).strip()}",
            anchor="e",
            fg=self._status_palette["muted"],
        )
        self.version_label.pack(side="right")
        self._append_log("UI ready.")

    def _append_log(self, line: str) -> None:
        msg = f"[{_utc_now_iso()}] {str(line or '').strip()}"
        self.log_text.insert("end", msg + "\n")
        self.log_text.see("end")

    def _add_help_badge(self, parent: Any, text: str) -> None:
        badge = tk.Label(
            parent,
            text="!",
            font=("Arial", 9, "bold"),
            fg=self._status_palette["info"],
            cursor="question_arrow",
        )
        badge.pack(side="left", padx=(4, 0))
        self._tooltips.append(_HoverTip(badge, text))

    def _pack_help_button(self, parent: Any, text: str, command: Any, help_text: str) -> None:
        wrap = ttk.Frame(parent)
        wrap.pack(side="left", padx=(8, 0) if parent.winfo_children() else (0, 0))
        ttk.Button(wrap, text=text, command=command).pack(side="left")
        self._add_help_badge(wrap, help_text)

    def _grid_help_button(self, parent: Any, row: int, column: int, text: str, command: Any, help_text: str) -> None:
        wrap = ttk.Frame(parent)
        wrap.grid(row=row, column=column, sticky="ew", padx=(8, 0) if column else (0, 0))
        ttk.Button(wrap, text=text, command=command).pack(side="left")
        self._add_help_badge(wrap, help_text)

    def _set_label_tone(self, label: Any, tone: str) -> None:
        color = self._status_palette.get(str(tone or "").strip().lower(), self._status_palette["muted"])
        try:
            label.configure(fg=color)
        except Exception:
            pass

    def _current_active_request_profile_names(self) -> set[str]:
        names = set()
        for row in self.sessions:
            if str(row.get("effective_auth") or "").strip().lower() != "iam":
                continue
            item = _request_aws_profile_record(row)
            profile = str((item or {}).get("profile") or "").strip()
            if profile:
                names.add(profile)
        return names

    def _compose_visible_aws_profile_records(self) -> list[Dict[str, str]]:
        active_request_records: list[Dict[str, str]] = []
        active_request_profiles = set()
        for row in self.sessions:
            if str(row.get("effective_auth") or "").strip().lower() != "iam":
                continue
            item = _request_aws_profile_record(row)
            profile = str((item or {}).get("profile") or "").strip()
            if not profile or profile in active_request_profiles:
                continue
            active_request_records.append(item)
            active_request_profiles.add(profile)

        cfg = _load_config()
        saved_profile = str(cfg.get("aws_profile") or "").strip()
        current_profile = self._selected_aws_profile()
        visible_local_records: list[Dict[str, str]] = []
        seen_profiles = set(active_request_profiles)
        for item in _aws_profile_records():
            profile = str(item.get("profile") or "").strip()
            if not profile or profile in seen_profiles:
                continue
            is_generated = profile.startswith("npamx-")
            if is_generated and profile not in active_request_profiles and profile not in (saved_profile, current_profile):
                continue
            visible_local_records.append(item)
            seen_profiles.add(profile)
        return active_request_records + visible_local_records

    def _aws_profile_matches_search(self, item: Dict[str, str], query: str) -> bool:
        needle = str(query or "").strip().lower()
        if not needle:
            return True
        hay = " ".join(
            [
                str(item.get("label") or ""),
                str(item.get("profile") or ""),
                str(item.get("permission_set") or ""),
                str(item.get("account_id") or ""),
                str(item.get("request_id") or ""),
            ]
        ).lower()
        return needle in hay

    def _apply_aws_profile_filter(self, preferred_profile: str = "") -> None:
        search = str(self.aws_search_var.get() or "").strip()
        labels: list[str] = []
        label_map: Dict[str, str] = {}
        for item in self.aws_profile_records:
            if not self._aws_profile_matches_search(item, search):
                continue
            label = str(item.get("label") or item.get("profile") or "").strip()
            profile = str(item.get("profile") or "").strip()
            if not label or not profile or label in label_map:
                continue
            labels.append(label)
            label_map[label] = profile
        self.aws_profile_labels = label_map
        self.aws_profile_combo["values"] = labels
        keep_profile = str(preferred_profile or self._selected_aws_profile()).strip()
        if labels:
            selected_label = next((label for label, profile in label_map.items() if profile == keep_profile), labels[0])
            self.aws_profile_var.set(selected_label)
            if search:
                self._set_aws_status(f"Showing {len(labels)} AWS profile match(es) for '{search}'.", "info")
        else:
            self.aws_profile_var.set("")
            if self.aws_profile_records:
                self._set_aws_status(f"No AWS profiles matched '{search}'. Clear the search to see all current options.", "warning")

    def _set_status(self, message: str, tone: str = "muted") -> None:
        self.status_var.set(str(message or "").strip())
        self._set_label_tone(self.status_label, tone)

    def _set_pair_message(self, message: str, tone: str = "warning") -> None:
        self.pair_var.set(str(message or "").strip())
        self._set_label_tone(self.pair_label, tone)

    def _set_pair_code(self, code: str) -> None:
        self.pair_code_var.set(str(code or "").strip())

    def _copy_pair_code(self) -> None:
        code = str(self.pair_code_var.get() or "").strip()
        if not code:
            self._append_log("No pairing code is available yet.")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(code)
        self._append_log("Pairing code copied to clipboard.")

    def _set_bootstrap_message(self, message: str, tone: str = "success") -> None:
        self.bootstrap_var.set(str(message or "").strip())
        self._set_label_tone(self.bootstrap_label, tone)

    def _set_summary(self, message: str, tone: str = "muted") -> None:
        self.summary_var.set(str(message or "").strip())
        self._set_label_tone(self.summary_label, tone)

    def _set_aws_status(self, message: str, tone: str = "info") -> None:
        self.aws_status_var.set(str(message or "").strip())
        self._set_label_tone(self.aws_status_label, tone)

    def _write_detail(self, text: str) -> None:
        self.detail_text.configure(state="normal")
        self.detail_text.delete("1.0", "end")
        self.detail_text.insert("1.0", text)
        self.detail_text.configure(state="disabled")

    def _config_from_ui(self) -> Dict[str, Any]:
        cfg = _load_config()
        cfg.update(
            {
                "server_url": _normalize_server_url(self.server_var.get()),
                "user_email": str(self.email_var.get() or "").strip().lower(),
                "user_name": str(self.user_var.get() or "").strip(),
                "host": str(cfg.get("host") or socket.gethostname()).strip(),
                "network_scope": str(cfg.get("network_scope") or "netskope").strip(),
                "aws_profile": str(self.aws_profile_var.get() or cfg.get("aws_profile") or "").strip(),
                "interval_seconds": int(cfg.get("interval_seconds") or DEFAULT_INTERVAL_SECONDS),
                "timeout_seconds": int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS),
                "agent_version": str(cfg.get("agent_version") or APP_VERSION).strip(),
                "updated_at": _utc_now_iso(),
            }
        )
        return cfg

    def _load_local_state_into_ui(self, *, state: Dict[str, Any], cfg: Dict[str, Any]) -> None:
        configured = bool(cfg.get("server_url") and cfg.get("agent_token") and cfg.get("user_email"))
        self.version_label.configure(text=f"Agent Version: {str(cfg.get('agent_version') or APP_VERSION).strip()}")
        self._set_status("Connected" if configured else "Not connected", "success" if configured else "muted")
        last_status = str(state.get("last_status") or "").strip()
        sessions = state.get("sessions") if isinstance(state.get("sessions"), list) else []
        if bool(cfg.get("bootstrap_loaded")):
            self._set_bootstrap_message(f"Agent profile loaded from {cfg.get('bootstrap_source')}", "success")
            self.server_entry.configure(state="readonly")
            self.email_entry.configure(state="readonly")
            self.user_entry.configure(state="readonly")
        else:
            self._set_bootstrap_message("No agent profile found. Download the profile from NPAMX and keep it next to the agent binary.", "warning")
            self.server_entry.configure(state="normal")
            self.email_entry.configure(state="normal")
            self.user_entry.configure(state="normal")
        self._refresh_sessions_tree(sessions)
        self._set_summary(f"Configured={configured} | Last status={last_status or 'n/a'} | Active sessions={len(sessions)}")
        self._refresh_aws_profiles(initial_profile=str(cfg.get("aws_profile") or "").strip())

    def _refresh_aws_profiles(self, initial_profile: str = "") -> None:
        records = self._compose_visible_aws_profile_records()
        selected = str(initial_profile or self.aws_profile_var.get() or "").strip()
        if records:
            self.aws_profile_records = records
            self._apply_aws_profile_filter(preferred_profile=selected)
            if not str(self.aws_search_var.get() or "").strip():
                active_count = len(self._current_active_request_profile_names())
                if active_count:
                    self._set_aws_status(f"Select the AWS account / permission set profile for the current request. Active request-linked profiles: {active_count}.", "info")
                else:
                    self._set_aws_status("Select the AWS account / permission set profile the agent should use for this session.", "info")
        else:
            self.aws_profile_records = []
            self.aws_profile_labels = {}
            self.aws_profile_combo["values"] = []
            self.aws_profile_var.set("")
            if _aws_cli_available():
                self._set_aws_status("AWS CLI is installed, but no profiles were found yet.", "warning")
            else:
                self._set_aws_status("AWS CLI is not installed on this machine.", "error")

    def _refresh_sessions_tree(self, sessions: list[Dict[str, Any]]) -> None:
        self.sessions = list(sessions or [])
        self.selected_credentials = {}
        for item in self.sessions_tree.get_children():
            self.sessions_tree.delete(item)
        if not self.sessions:
            self._write_detail("You do not have any approved JIT database sessions right now.")
            self.session_detail_var.set("You do not have any approved JIT database sessions right now.")
            return
        for row in self.sessions:
            self.sessions_tree.insert(
                "",
                "end",
                iid=str(row.get("request_id") or uuid.uuid4().hex),
                values=(
                    str(row.get("request_id") or "").strip(),
                    str(row.get("engine") or "").strip(),
                    str(row.get("account_name") or row.get("account_id") or "").strip(),
                    str(row.get("database") or "").strip(),
                    str(row.get("iam_permission_set_name") or row.get("db_username") or "").strip(),
                    str(row.get("effective_auth") or "").strip(),
                    str(row.get("expires_at") or "").strip(),
                ),
            )

    def _on_session_select(self, _event=None) -> None:
        selected = self.sessions_tree.selection()
        if not selected:
            self._write_detail("No session selected.")
            return
        request_id = selected[0]
        row = next((item for item in self.sessions if str(item.get("request_id") or "") == request_id), {})
        if not row:
            self._write_detail("No session selected.")
            return
        lines = [
            f"Request ID: {row.get('request_id')}",
            f"Account: {row.get('account_name') or row.get('account_id')}",
            f"Engine: {row.get('engine')}",
            f"Database: {row.get('database')}",
            f"Username: {row.get('db_username')}",
            f"Permission Set: {row.get('iam_permission_set_name') or 'n/a'}",
            f"Auth: {row.get('effective_auth')}",
            f"Host: {row.get('proxy_host')}",
            f"Port: {row.get('proxy_port')}",
            f"Expires: {row.get('expires_at')}",
            "",
            "Suggested DBeaver fields:",
            f"Host = {((row.get('dbeaver_profile') or {}).get('host') or row.get('proxy_host') or '')}",
            f"Port = {((row.get('dbeaver_profile') or {}).get('port') or row.get('proxy_port') or '')}",
            f"Database = {((row.get('dbeaver_profile') or {}).get('database') or row.get('database') or '')}",
            f"Username = {((row.get('dbeaver_profile') or {}).get('username') or row.get('db_username') or '')}",
            "",
            "Use 'Load Login Details' to fetch credentials into the agent.",
        ]
        self._write_detail("\n".join(lines))
        self.session_detail_var.set("\n".join(lines))

    def _copy_selected_details(self) -> None:
        text = str(self.session_detail_var.get() or "").strip()
        if not text:
            self._append_log("No session details selected to copy.")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self._append_log("Selected session details copied to clipboard.")

    def _selected_aws_profile(self) -> str:
        label = str(self.aws_profile_var.get() or "").strip()
        return str(self.aws_profile_labels.get(label) or label).strip()

    def _prepare_selected_request_aws_profile(self, creds: Dict[str, Any] | None = None) -> str:
        row = self._selected_session()
        if not row:
            return self._selected_aws_profile()
        if str(row.get("effective_auth") or "").strip().lower() != "iam":
            return self._selected_aws_profile()
        ic = row.get("identity_center") if isinstance(row.get("identity_center"), dict) else {}
        local_ic = (((creds or {}).get("local_token_instructions") or {}).get("identity_center") or {})
        if isinstance(local_ic, dict):
            merged_ic = dict(ic or {})
            merged_ic.update({k: v for k, v in local_ic.items() if v})
            ic = merged_ic
        start_url = str((ic or {}).get("start_url") or "").strip()
        sso_region = str((ic or {}).get("region") or "").strip()
        account_id = str((ic or {}).get("account_id") or row.get("account_id") or "").strip()
        permission_set_name = str((ic or {}).get("permission_set_name") or row.get("iam_permission_set_name") or "").strip()
        if not start_url or not sso_region or not account_id or not permission_set_name:
            return self._selected_aws_profile()
        profile_name = _request_profile_name(row, creds)
        default_region = str((creds or {}).get("region") or "ap-south-1").strip() or "ap-south-1"
        _ensure_aws_sso_profile(
            profile_name=profile_name,
            start_url=start_url,
            sso_region=sso_region,
            account_id=account_id,
            permission_set_name=permission_set_name,
            default_region=default_region,
        )
        self.root.after(0, lambda profile_name=profile_name: self._refresh_aws_profiles(initial_profile=profile_name))
        return profile_name

    def _check_aws_profile_background(self) -> None:
        def worker() -> None:
            try:
                profile = self._prepare_selected_request_aws_profile(self.selected_credentials if isinstance(self.selected_credentials, dict) else {})
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._set_aws_status(f"AWS profile preparation failed: {err}", "error"))
                self.root.after(0, lambda err=err: self._append_log(f"AWS profile preparation failed: {err}"))
                return
            if not profile:
                self.root.after(0, lambda: self._append_log("Select an AWS CLI profile first."))
                return
            result = _aws_profile_identity(profile)
            if result.get("ok"):
                account_id = str(result.get("account_id") or "").strip()
                arn = str(result.get("arn") or "").strip()
                self.root.after(0, lambda: self.aws_status_var.set(f"Active AWS session: {profile} | {account_id} | {arn}"))
                self.root.after(0, lambda: self._set_aws_status(f"Active AWS session: {profile} | {account_id} | {arn}", "success"))
                self.root.after(0, lambda: self._append_log(f"AWS profile {profile} is ready."))
                cfg = _load_config()
                cfg["aws_profile"] = profile
                _save_config(cfg)
            else:
                err = str(result.get("error") or "").strip() or "AWS session is not ready."
                self.root.after(0, lambda: self._set_aws_status(f"AWS profile {profile} is not ready: {err}", "error"))
                self.root.after(0, lambda: self._append_log(f"AWS profile check failed: {err}"))

        threading.Thread(target=worker, daemon=True).start()

    def _aws_login_background(self) -> None:
        def worker() -> None:
            try:
                profile = self._prepare_selected_request_aws_profile(self.selected_credentials if isinstance(self.selected_credentials, dict) else {})
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._set_aws_status(f"AWS profile preparation failed: {err}", "error"))
                self.root.after(0, lambda err=err: self._append_log(f"AWS profile preparation failed: {err}"))
                return
            if not profile:
                self.root.after(0, lambda: self._append_log("Select an AWS CLI profile first."))
                return
            self.root.after(0, lambda: self._set_aws_status(f"Running AWS SSO login for profile {profile}...", "warning"))
            result = _aws_sso_login(profile)
            if result.get("ok"):
                cfg = _load_config()
                cfg["aws_profile"] = profile
                _save_config(cfg)
                self.root.after(0, lambda: self._set_aws_status(f"AWS SSO login complete for profile {profile}.", "success"))
                self.root.after(0, lambda: self._append_log(f"AWS SSO login complete for profile {profile}."))
                self._check_aws_profile_background()
            else:
                err = str(result.get("error") or "").strip() or "AWS SSO login failed."
                self.root.after(0, lambda: self._set_aws_status(f"AWS SSO login failed for {profile}: {err}", "error"))
                self.root.after(0, lambda: self._append_log(f"AWS SSO login failed: {err}"))

        threading.Thread(target=worker, daemon=True).start()

    def _selected_session(self) -> Dict[str, Any]:
        selected = self.sessions_tree.selection()
        if not selected:
            return {}
        request_id = selected[0]
        return next((item for item in self.sessions if str(item.get("request_id") or "") == request_id), {})

    def _render_credentials_detail(self, session_row: Dict[str, Any], creds: Dict[str, Any]) -> str:
        dbeaver = creds.get("dbeaver_profile") if isinstance(creds.get("dbeaver_profile"), dict) else {}
        host = str(dbeaver.get("host") or creds.get("proxy_host") or session_row.get("proxy_host") or "").strip()
        port = str(dbeaver.get("port") or creds.get("proxy_port") or session_row.get("proxy_port") or "").strip()
        database = str(dbeaver.get("database") or creds.get("database") or session_row.get("database") or "").strip()
        username = str(dbeaver.get("username") or creds.get("db_username") or session_row.get("db_username") or "").strip()
        effective_auth = str(creds.get("effective_auth") or session_row.get("effective_auth") or "").strip()
        lines = [
            f"Request ID: {session_row.get('request_id')}",
            f"Account: {session_row.get('account_name') or session_row.get('account_id')}",
            f"Engine: {session_row.get('engine')}",
            f"Permission Set: {session_row.get('iam_permission_set_name') or 'n/a'}",
            f"Endpoint Mode: {session_row.get('connect_endpoint_mode') or creds.get('connect_endpoint_mode') or 'unknown'}",
            "",
            "DBeaver connection fields:",
            f"Host = {host}",
            f"Port = {port}",
            f"Database = {database}",
            f"Username = {username}",
            f"Auth = {effective_auth}",
        ]
        secret = str(creds.get("password") or creds.get("vault_token") or "").strip()
        if secret:
            lines.extend(["", "Password/token has been copied to your clipboard for this session."])
        elif creds.get("local_token_instructions"):
            lines.extend([
                "",
                "This session uses IAM-style local token generation. Select an AWS profile and click Connect.",
            ])
        else:
            lines.extend(["", "No reusable password was returned for this session."])
        expires = str(creds.get("expires_at") or session_row.get("expires_at") or "").strip()
        if expires:
            lines.append(f"Session expires at = {expires}")
        return "\n".join(lines)

    def _load_selected_credentials_background(self) -> None:
        row = self._selected_session()
        if not row:
            self._append_log("Select an approved session first.")
            return

        def worker() -> None:
            try:
                cfg = _require_config()
                timeout = int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS)
                creds = fetch_database_session_credentials(cfg, request_id=str(row.get("request_id") or "").strip(), timeout=timeout)
                self.selected_credentials = creds if isinstance(creds, dict) else {}
                secret = str((creds or {}).get("password") or (creds or {}).get("vault_token") or "").strip()
                detail = self._render_credentials_detail(row, creds if isinstance(creds, dict) else {})
                def _update() -> None:
                    self._write_detail(detail)
                    self.session_detail_var.set(detail)
                    if secret:
                        self.root.clipboard_clear()
                        self.root.clipboard_append(secret)
                        self._append_log("Session credentials loaded. Password/token copied to clipboard.")
                    else:
                        self._append_log("Session details loaded.")
                self.root.after(0, _update)
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._append_log(f"Failed to load login details: {err}"))

        threading.Thread(target=worker, daemon=True).start()

    def _launch_dbeaver(self, connection_arg: str = "") -> None:
        cmd = _find_dbeaver_command()
        args = list(cmd)
        if connection_arg:
            args.extend(["-con", connection_arg])
        if platform.system().lower().startswith("win"):
            subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _connect_selected_session_background(self) -> None:
        row = self._selected_session()
        if not row:
            self._append_log("Select an approved session first.")
            return

        def worker() -> None:
            try:
                self.root.after(0, lambda: self._set_status("Preparing DBeaver connection...", "warning"))
                creds = self.selected_credentials if isinstance(self.selected_credentials, dict) else {}
                if not creds or str(creds.get("request_id") or "").strip() != str(row.get("request_id") or "").strip():
                    cfg = _require_config()
                    timeout = int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS)
                    creds = fetch_database_session_credentials(cfg, request_id=str(row.get("request_id") or "").strip(), timeout=timeout)
                    self.selected_credentials = creds if isinstance(creds, dict) else {}
                profile = self._selected_aws_profile()
                if str(row.get("effective_auth") or "").strip().lower() == "iam":
                    profile = self._prepare_selected_request_aws_profile(creds if isinstance(creds, dict) else {})
                    if not profile:
                        raise RuntimeError("AWS Identity Center profile could not be prepared for this request.")
                    ident = _aws_profile_identity(profile)
                    if not ident.get("ok"):
                        raise RuntimeError(str(ident.get("error") or "").strip() or "AWS profile is not ready.")
                material = _generate_iam_login_material(creds if isinstance(creds, dict) else {}, profile)
                secret = str(material.get("password") or "").strip()
                effective_username = str(material.get("username") or (creds or {}).get("db_username") or "").strip()
                merged_creds = dict(creds if isinstance(creds, dict) else {})
                if effective_username:
                    merged_creds["db_username"] = effective_username
                if secret:
                    merged_creds["password"] = secret
                host, port, endpoint_mode = _connection_target(row, merged_creds)
                ok, connect_error = _tcp_connectivity_probe(host, port, timeout_seconds=5)
                if not ok:
                    guidance = (
                        f"Selected endpoint {host}:{port} is not reachable from this machine."
                        if host and port
                        else "Selected connection endpoint is incomplete."
                    )
                    if endpoint_mode == "direct":
                        guidance += " Current mode is direct, so the laptop needs network access to the private database endpoint or NPAMX must be configured with a DB connect proxy."
                    elif endpoint_mode == "proxy":
                        guidance += " Current mode is proxy, so the configured NPAMX DB connect proxy host/port may be unreachable from this laptop."
                    if connect_error:
                        guidance += f" Probe result: {connect_error}"
                    raise RuntimeError(guidance)
                detail = self._render_credentials_detail(row, merged_creds)
                connection_arg = _build_dbeaver_connection_arg(row, merged_creds)
                def _update_before_open() -> None:
                    self._write_detail(detail)
                    self.session_detail_var.set(detail)
                    if secret:
                        self.root.clipboard_clear()
                        self.root.clipboard_append(secret)
                self.root.after(0, _update_before_open)
                self._launch_dbeaver(connection_arg)
                self.root.after(0, lambda: self._set_status("DBeaver connection launched.", "success"))
                self.root.after(0, lambda req_id=str(row.get("request_id") or "").strip(): self._append_log(
                    f"DBeaver launch requested for request {req_id}. Temporary NPAMX connection opened in folder 'NPAMX JIT'."
                ))
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._append_log(f"Failed to connect selected session: {err}"))
                self.root.after(0, lambda err=err: self._set_status(f"Connect failed: {err}", "error"))
                if messagebox is not None:
                    self.root.after(0, lambda err=err: messagebox.showerror("NPAMX Agent Connect Failed", err or "Connect failed."))

        threading.Thread(target=worker, daemon=True).start()

    def _login_background(self) -> None:
        def worker() -> None:
            try:
                cfg = self._config_from_ui()
                if not cfg["server_url"] or not cfg["user_email"]:
                    raise RuntimeError("Server URL and user email are required.")
                self.root.after(0, lambda: self._set_status("Starting login...", "warning"))
                self.root.after(0, lambda: self._set_pair_message("Requesting one-time pairing code from NPAMX...", "warning"))
                self.root.after(0, lambda: self._append_log("Starting login flow."))
                _save_config(cfg)
                start = start_pairing(cfg, timeout=int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
                device_code = str(start.get("device_code") or "").strip()
                user_code = str(start.get("user_code") or "").strip()
                verify_url = str(start.get("verification_url") or cfg["server_url"]).strip()
                if not device_code or not user_code:
                    raise RuntimeError("Pairing start failed.")
                self.root.after(0, lambda code=user_code: self._set_pair_code(code))
                self.root.after(0, lambda: self._set_pair_message(f"Pairing code: {user_code} | Open NPAMX: {verify_url}", "warning"))
                self.root.after(0, lambda: self._set_status("Waiting for NPAMX approval...", "warning"))
                self.root.after(0, lambda: self._append_log(f"Pairing code generated: {user_code}"))
                interval = max(3, int(start.get("interval") or 5))
                deadline = time.time() + 900
                while time.time() < deadline:
                    poll = poll_pairing(cfg, device_code=device_code, timeout=int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
                    if str(poll.get("status") or "").strip().lower() == "success":
                        cfg["agent_token"] = str(poll.get("access_token") or "").strip()
                        if poll.get("user_email"):
                            cfg["user_email"] = str(poll.get("user_email") or "").strip().lower()
                        _save_config(cfg)
                        register_response = register_agent(cfg, timeout=int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
                        _merge_state(
                            {
                                "last_action": "login_register",
                                "last_status": "success",
                                "mode": "identity_center_pairing",
                                "pairing_response": poll,
                                "register_response": register_response,
                                "updated_at": _utc_now_iso(),
                            }
                        )
                        self.root.after(0, lambda: self._set_status("Connected", "success"))
                        self.root.after(0, lambda: self._append_log("Login successful. Agent paired and registered."))
                        self.root.after(0, lambda: self._set_pair_code(""))
                        self.root.after(0, lambda: self._set_pair_message("Pairing complete.", "success"))
                        self.root.after(0, self._refresh_from_server_background)
                        return
                    self.root.after(0, lambda: self._set_status("Waiting for NPAMX approval...", "warning"))
                    self.root.after(0, lambda: self._append_log("Waiting for pairing approval..."))
                    time.sleep(interval)
                raise RuntimeError("Pairing timed out.")
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._append_log(f"Login failed: {err}"))
                self.root.after(0, lambda err=err: self._set_status(f"Login failed: {err}", "error"))
                self.root.after(0, lambda: self._set_pair_code(""))
                self.root.after(0, lambda: self._set_pair_message("Login did not complete. Start login again.", "error"))
                if messagebox is not None:
                    self.root.after(0, lambda err=err: messagebox.showerror("NPAMX Agent Login Failed", err or "Login failed."))

        threading.Thread(target=worker, daemon=True).start()

    def _refresh_from_server_background(self) -> None:
        def worker() -> None:
            try:
                cfg = _require_config()
                timeout = int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS)
                state = _run_one_cycle(cfg, timeout=timeout)
                sessions = state.get("sessions") if isinstance(state.get("sessions"), list) else []
                self.root.after(0, lambda: self._refresh_sessions_tree(sessions))
                self.root.after(0, lambda profile=str(cfg.get("aws_profile") or "").strip(): self._refresh_aws_profiles(initial_profile=profile))
                self.root.after(0, lambda: self._set_status("Connected", "success"))
                self.root.after(0, lambda: self._set_summary(
                    f"Connected | Last update={state.get('updated_at')} | Active sessions={len(sessions)}"
                ))
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._append_log(f"Refresh failed: {err}"))
                self.root.after(0, lambda err=err: self._set_status(f"Disconnected: {err}", "error"))

        threading.Thread(target=worker, daemon=True).start()

    def _start_loop(self) -> None:
        if self.loop_thread and self.loop_thread.is_alive():
            self._append_log("Agent loop is already running.")
            return
        self.stop_event.clear()

        def worker() -> None:
            try:
                cfg = _require_config()
                interval = max(10, int(cfg.get("interval_seconds") or DEFAULT_INTERVAL_SECONDS))
                timeout = max(3, int(cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS))
                while not self.stop_event.is_set():
                    state = _run_one_cycle(cfg, timeout=timeout)
                    sessions = state.get("sessions") if isinstance(state.get("sessions"), list) else []
                    self.root.after(0, lambda s=sessions, st=state: self._refresh_sessions_tree(s))
                    self.root.after(0, lambda: self._set_status("Connected", "success"))
                    self.root.after(0, lambda st=state, s=sessions: self._set_summary(
                        f"Connected | Last update={st.get('updated_at')} | Active sessions={len(s)}"
                    ))
                    self.root.after(0, lambda: self._append_log("Heartbeat ok."))
                    self.stop_event.wait(interval)
            except Exception as exc:
                err = str(exc).strip()
                self.root.after(0, lambda err=err: self._append_log(f"Agent loop failed: {err}"))
                self.root.after(0, lambda err=err: self._set_status(f"Agent loop failed: {err}", "error"))

        self.loop_thread = threading.Thread(target=worker, daemon=True)
        self.loop_thread.start()
        self._append_log("Agent loop started.")

    def _stop_loop(self) -> None:
        self.stop_event.set()
        self._append_log("Agent loop stop requested.")

    def _logout(self) -> None:
        cmd_logout(argparse.Namespace())
        self._set_status("Logged out", "warning")
        self._set_pair_code("")
        self._set_pair_message("", "muted")
        self._set_summary("Local agent token removed.", "muted")
        self._refresh_sessions_tree([])
        self._write_detail("No session selected.")
        self._append_log("Agent configuration removed.")

    def _on_close(self) -> None:
        self.stop_event.set()
        self.root.destroy()

    def run(self) -> int:
        self.root.mainloop()
        return 0


def cmd_ui(_: argparse.Namespace) -> int:
    if tk is None or ttk is None:
        raise RuntimeError("Tkinter UI is not available in this build.")
    return AgentStatusWindow().run()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NPAMX Desktop Agent")
    sub = parser.add_subparsers(dest="command", required=False)

    login = sub.add_parser("login", help="One-time agent login and registration")
    login.add_argument("--server-url", required=False, help="NPAMX base URL, e.g. https://npamx.company.com")
    login.add_argument("--token", default="", help="Legacy shared token (optional; not needed for Identity Center pairing mode)")
    login.add_argument("--user-email", required=False, help="User email")
    login.add_argument("--user-name", default="", help="Optional display name")
    login.add_argument("--host", default="", help="Optional host override")
    login.add_argument("--network-scope", default="netskope", help="Network scope label")
    login.add_argument("--interval-seconds", type=int, default=DEFAULT_INTERVAL_SECONDS, help="Heartbeat interval")
    login.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP timeout")
    login.add_argument("--pairing-timeout-seconds", type=int, default=900, help="Max wait for browser pairing approval")
    login.add_argument("--agent-version", default="1.0.0", help="Agent version label")
    login.set_defaults(func=cmd_login)

    register = sub.add_parser("register", help="Register agent")
    register.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout override")
    register.set_defaults(func=cmd_register)

    heartbeat = sub.add_parser("heartbeat", help="Send a single heartbeat")
    heartbeat.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout override")
    heartbeat.set_defaults(func=cmd_heartbeat)

    run = sub.add_parser("run", help="Run continuous heartbeat loop")
    run.add_argument("--interval-seconds", type=int, default=0, help="Heartbeat interval override")
    run.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout override")
    run.add_argument("--once", action="store_true", help="Run one register+heartbeat cycle and exit")
    run.set_defaults(func=cmd_run)

    status = sub.add_parser("status", help="Show local agent status")
    status.set_defaults(func=cmd_status)

    sessions = sub.add_parser("sessions", help="List active NPAMX database sessions for this paired user")
    sessions.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout override")
    sessions.set_defaults(func=cmd_sessions)

    session_creds = sub.add_parser("session-credentials", help="Fetch login details for one approved database request")
    session_creds.add_argument("request_id", help="Database request id")
    session_creds.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout override")
    session_creds.set_defaults(func=cmd_session_credentials)

    ui = sub.add_parser("ui", help="Open local desktop agent status window")
    ui.set_defaults(func=cmd_ui)

    logout = sub.add_parser("logout", help="Remove local agent configuration")
    logout.set_defaults(func=cmd_logout)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    try:
        if not getattr(args, "command", None):
            return int(cmd_ui(args))
        return int(args.func(args))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
