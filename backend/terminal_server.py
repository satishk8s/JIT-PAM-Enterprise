"""
Deprecated terminal server.

The previous implementation accepted unauthenticated WebSocket connections,
transmitted credentials in URL query strings, and disabled SSH host key
verification. That is not safe to ship in PAM.

This module now fails closed. Use AWS SSM Session Manager or a separately
reviewed terminal gateway instead.
"""

from __future__ import annotations


def main() -> None:
    raise RuntimeError(
        "terminal_server.py is intentionally disabled. "
        "Use AWS SSM Session Manager or a separately reviewed terminal gateway."
    )


if __name__ == "__main__":
    main()
