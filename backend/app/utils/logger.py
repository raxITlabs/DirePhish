"""
Logging Configuration Module
Provides unified logging management with output to both console and file
"""

import os
import sys
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler


def _ensure_utf8_stdout():
    """
    Ensure stdout/stderr use UTF-8 encoding
    Fixes character encoding issues in Windows console
    """
    if sys.platform == 'win32':
        # Reconfigure standard output to UTF-8 on Windows
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')


# Log directory
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logs')


# Shared handlers — created once, reused by all loggers
_shared_file_handler: RotatingFileHandler | None = None
_shared_console_handler: logging.StreamHandler | None = None


def _get_shared_handlers() -> tuple[RotatingFileHandler, logging.StreamHandler]:
    """Return shared file and console handlers (created once)."""
    global _shared_file_handler, _shared_console_handler

    if _shared_file_handler is None:
        os.makedirs(LOG_DIR, exist_ok=True)
        detailed_formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        log_filename = datetime.now().strftime('%Y-%m-%d') + '.log'
        _shared_file_handler = RotatingFileHandler(
            os.path.join(LOG_DIR, log_filename),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding='utf-8'
        )
        _shared_file_handler.setLevel(logging.DEBUG)
        _shared_file_handler.setFormatter(detailed_formatter)

    if _shared_console_handler is None:
        _ensure_utf8_stdout()
        simple_formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s: %(message)s',
            datefmt='%H:%M:%S'
        )
        _shared_console_handler = logging.StreamHandler(sys.stdout)
        _shared_console_handler.setLevel(logging.INFO)
        _shared_console_handler.setFormatter(simple_formatter)

    return _shared_file_handler, _shared_console_handler


def setup_logger(name: str = 'direphish', level: int = logging.DEBUG) -> logging.Logger:
    """Set up logger with shared file + console handlers."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False

    if logger.handlers:
        return logger

    file_handler, console_handler = _get_shared_handlers()
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def get_logger(name: str = 'direphish') -> logging.Logger:
    """Get logger (create if not exists)."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        return setup_logger(name)
    return logger


# Create default logger
logger = setup_logger()


# Convenience methods
def debug(msg, *args, **kwargs):
    logger.debug(msg, *args, **kwargs)

def info(msg, *args, **kwargs):
    logger.info(msg, *args, **kwargs)

def warning(msg, *args, **kwargs):
    logger.warning(msg, *args, **kwargs)

def error(msg, *args, **kwargs):
    logger.error(msg, *args, **kwargs)

def critical(msg, *args, **kwargs):
    logger.critical(msg, *args, **kwargs)

