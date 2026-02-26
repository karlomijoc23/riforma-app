from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.core.config import get_settings
from jose import jwt
from passlib.context import CryptContext

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password must not be empty")
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return pwd_context.verify(plain_password, password_hash)
    except ValueError:
        return False


def create_access_token(
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(
        to_encode, settings.AUTH_SECRET, algorithm=settings.AUTH_ALGORITHM
    )
