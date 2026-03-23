"""
WSGI entry for production servers (e.g. Gunicorn).
"""

import sys

from app import create_app
from app.config import Config

errors = Config.validate()
if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)

app = create_app()
