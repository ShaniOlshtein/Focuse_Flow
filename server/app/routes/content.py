import re
from typing import Literal
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from ..db import db
from ..security import current_user
from ..utils import iso, now, oid

router = APIRouter(prefix="/content", tags=["content"])
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_id(url: str) -> str | None:
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or host not in YT_HOSTS:
        return None
    if host.endswith("youtu.be"):
        vid = p.path.strip("/").split("/")[0]
    elif p.path == "/watch":
        vid = parse_qs(p.query).get("v", [""])[0]
    else:
        parts = p.path.strip("/").split("/")
        vid = parts[1] if len(parts) > 1 and parts[0] in ("embed", "shorts", "live", "v") else ""
    return vid if YT_ID.match(vid or "") else None


class ContentIn(BaseModel):
    type: Literal["youtube", "text", "web"]
    title: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=100_000)
    bed: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def check_source(self):
        self.title, self.source = self.title.strip(), self.source.strip()
        self.bed = (self.bed or "").strip() or None
        if not self.title:
            raise ValueError("הכותרת ריקה")
        if not self.source:
            raise ValueError("המקור ריק")
        if self.type == "youtube" and not youtube_id(self.source):
            raise ValueError("קישור YouTube לא תקין")
        if self.type == "web":
            p = urlparse(self.source)
            if p.scheme not in ("http", "https") or not p.hostname or len(self.source) > 2000:
                raise ValueError("כתובת אתר לא תקינה (צריכה להתחיל ב-https://)")
        return self


def content_out(c: dict) -> dict:
    out = {"id": str(c["_id"]), "type": c["type"], "title": c["title"], "source": c["source"],
           "bed": c.get("bed"), "created_at": iso(c["created_at"])}
    if c["type"] == "youtube":
        out["youtube_id"] = youtube_id(c["source"])
    return out


async def get_owned(content_id: str, user: dict) -> dict:
    c = await db.content.find_one({"_id": oid(content_id, "התוכן"), "user_id": user["_id"]})
    if not c:
        raise HTTPException(404, "התוכן לא נמצא")
    return c


@router.post("", status_code=201)
async def create(body: ContentIn, user: dict = Depends(current_user)):
    doc = {"user_id": user["_id"], **body.model_dump(), "created_at": now()}
    res = await db.content.insert_one(doc)
    doc["_id"] = res.inserted_id
    return content_out(doc)


@router.get("")
async def list_content(user: dict = Depends(current_user)):
    cur = db.content.find({"user_id": user["_id"]}).sort("created_at", -1)
    return [content_out(c) async for c in cur]


@router.get("/{content_id}")
async def get_one(content_id: str, user: dict = Depends(current_user)):
    return content_out(await get_owned(content_id, user))


@router.delete("/{content_id}", status_code=204)
async def delete(content_id: str, user: dict = Depends(current_user)):
    c = await get_owned(content_id, user)
    await db.content.delete_one({"_id": c["_id"], "user_id": user["_id"]})
    return Response(status_code=204)
