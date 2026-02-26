"""Pytest configuration and shared fixtures."""

import os
import sys

# Ensure backend root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set defaults for test environment
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("AUTH_SECRET", "test-secret-not-for-production")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///")
