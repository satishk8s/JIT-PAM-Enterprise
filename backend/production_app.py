"""
Deprecated compatibility entrypoint.

The secure NPAM backend lives in backend/app.py. This module now delegates to the
primary app so older scripts do not accidentally boot an outdated prototype service.
"""

from app import app


if __name__ == '__main__':
    import os

    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=False,
    )
