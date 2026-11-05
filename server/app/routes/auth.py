from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo.errors import DuplicateKeyError

from .. import config
from ..db import db
from ..security import client_ip, create_token, current_claims, hash_password, verify_password
from ..utils import iso, now

router = APIRouter(prefix="/auth", tags=["auth"])


def clean_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("שם התצוגה ריק")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=50)

    @field_validator("display_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return clean_name(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def user_out(u: dict) -> dict:
    return {"id": str(u["_id"]), "email": u["email"], "display_name": u["display_name"],
            "created_at": iso(u["created_at"])}


@router.post("/register", status_code=201)
async def register(body: RegisterIn):
    doc = {"email": body.email.lower(), "password_hash": hash_password(body.password),
           "display_name": body.display_name, "created_at": now(), "token_version": 0}
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "כתובת האימייל כבר רשומה")
    return {"id": str(res.inserted_id), "email": doc["email"], "display_name": doc["display_name"]}


@router.post("/login")
async def login(body: LoginIn, request: Request):
    email = body.email.lower()
    key = f"{email}|{client_ip(request)}"
    if await db.login_failures.count_documents({"key": key}) >= config.LOGIN_MAX_FAILURES:
        raise HTTPException(429, "יותר מדי ניסיונות התחברות שגויים. נסו שוב בעוד 15 דקות")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_failures.insert_one({"key": key, "created_at": now()})
        raise HTTPException(401, "אימייל או סיסמה שגויים")
    await db.login_failures.delete_many({"key": key})
    token, exp = create_token(user)
    return {"access_token": token, "token_type": "bearer", "expires_in": exp}


@router.post("/logout", status_code=204)
async def logout(claims: dict = Depends(current_claims)):
    exp = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    await db.token_denylist.update_one({"jti": claims["jti"]},
                                       {"$setOnInsert": {"jti": claims["jti"], "expires_at": exp}}, upsert=True)
    return Response(status_code=204)
