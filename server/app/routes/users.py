from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from ..db import db
from ..security import current_user, hash_password, verify_password
from .auth import clean_name, user_out

router = APIRouter(prefix="/users", tags=["users"])


class PatchMe(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)

    @field_validator("display_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return clean_name(v)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
async def patch_me(body: PatchMe, user: dict = Depends(current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"display_name": body.display_name}})
    user["display_name"] = body.display_name
    return user_out(user)


@router.post("/me/password", status_code=204)
async def change_password(body: PasswordIn, user: dict = Depends(current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "הסיסמה הנוכחית שגויה")
    # bump token_version -> every previously issued token becomes invalid
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"password_hash": hash_password(body.new_password)},
                               "$inc": {"token_version": 1}})
    return Response(status_code=204)


@router.delete("/me", status_code=204)
async def delete_me(user: dict = Depends(current_user)):
    uid = user["_id"]
    for coll in ("readings", "sessions", "content"):
        await db[coll].delete_many({"user_id": uid})
    await db.users.delete_one({"_id": uid})
    return Response(status_code=204)
