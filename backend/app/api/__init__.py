"""
API Routes Module
"""

from flask import Blueprint

report_bp = Blueprint('report', __name__)

from . import report  # noqa: E402, F401

