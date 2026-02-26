"""Structured logging configuration for Riforma.

Usage:
    Call ``setup_logging()`` at application startup (top of lifespan).

Environment variables:
    LOG_LEVEL  - Python log level name (default: INFO)
    LOG_FORMAT - "json" for production structured logs, "text" for dev (default: text)
"""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter


def setup_logging(level: str = "INFO", fmt: str = "text") -> None:
    """Configure the root logger.

    Args:
        level: Python log level name (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        fmt: "json" for structured JSON output, anything else for human-readable text.
    """
    root = logging.getLogger()
    root.setLevel(level.upper())

    # Remove any existing handlers to avoid duplicate output
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)

    if fmt == "json":
        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"},
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(formatter)
    root.addHandler(handler)

    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
