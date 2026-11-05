import uuid
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config
from .db import db
from .utils import now

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: dict) -> tuple[str, int]:
    issued = now()
    exp_sec = config.JWT_EXPIRES_MIN * 60
    payload = {
        "sub": str(user["_id"]),
        "jti": uuid.uuid4().hex,
        "ver": user.get("token_version", 0),
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=exp_sec)).timestamp()),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALG), exp_sec


def _unauthorized(msg: str = "יש להתחבר מחדש"):
    return HTTPException(401, msg, headers={"WWW-Authenticate": "Bearer"})


async def current_claims(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized("לא מחובר/ת")
    try:
        claims = jwt.decode(creds.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALG],
                            options={"require": ["sub", "jti", "exp", "iat"]})
    except jwt.PyJWTError:
        raise _unauthorized()
    if await db.token_denylist.find_one({"jti": claims["jti"]}):
        raise _unauthorized()
    return claims


async def current_user(claims: dict = Depends(current_claims)) -> dict:
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(claims["sub"])})
    # token_version changes on password change -> older tokens are rejected
    if not user or user.get("token_version", 0) != claims.get("ver", 0):
        raise _unauthorized()
    user["_claims"] = claims
    return user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")
