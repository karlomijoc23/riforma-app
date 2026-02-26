"""Shared rate limiter instance (slowapi).

Import ``limiter`` from here in any endpoint module that needs rate limiting.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
