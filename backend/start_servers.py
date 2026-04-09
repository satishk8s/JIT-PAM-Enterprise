#!/usr/bin/env python3
"""Run the Flask app and S3 Explorer together inside the Docker container."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return str(value).strip() if value is not None and str(value).strip() else default


def _port(name: str, default: str) -> str:
    raw = _env(name, default)
    return raw if raw.isdigit() else default


def _terminate_processes(processes: list[subprocess.Popen[str]], sig: int) -> None:
    for process in processes:
        if process.poll() is None:
            try:
                process.send_signal(sig)
            except Exception:
                pass


def main() -> int:
    app_port = _port("APP_PORT", "5000")
    s3_port = _port("S3_PORT", "8001")
    gunicorn_cmd = [
        "gunicorn",
        "--worker-tmp-dir",
        "/tmp",
        "--workers",
        _env("GUNICORN_WORKERS", "1"),
        "--threads",
        _env("GUNICORN_THREADS", "4"),
        "--timeout",
        _env("GUNICORN_TIMEOUT", "120"),
        "--bind",
        f"0.0.0.0:{app_port}",
        "docker_serve:app",
    ]
    s3_cmd = [
        "python",
        "-m",
        "uvicorn",
        "s3_app:app",
        "--host",
        "0.0.0.0",
        "--port",
        s3_port,
    ]

    processes = [
        subprocess.Popen(s3_cmd, text=True),
        subprocess.Popen(gunicorn_cmd, text=True),
    ]

    def _handle_signal(signum, _frame):
        _terminate_processes(processes, signum)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    try:
        while True:
            for process in processes:
                return_code = process.poll()
                if return_code is None:
                    continue
                _terminate_processes(processes, signal.SIGTERM)
                deadline = time.time() + 10
                for other in processes:
                    if other is process:
                        continue
                    while other.poll() is None and time.time() < deadline:
                        time.sleep(0.1)
                    if other.poll() is None:
                        try:
                            other.kill()
                        except Exception:
                            pass
                return return_code
            time.sleep(0.5)
    finally:
        _terminate_processes(processes, signal.SIGTERM)


if __name__ == "__main__":
    sys.exit(main())
