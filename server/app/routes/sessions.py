from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import config
from ..db import db
from ..growth import SPECIES, growth
from ..security import current_user
from ..utils import iso, now, oid
from .content import get_owned

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionIn(BaseModel):
    content_id: str = Field(min_length=1, max_length=64)
    room_code: str | None = Field(default=None, max_length=12)


class ReadingIn(BaseModel):
    position: float = Field(ge=0, le=10_000_000)
    score: float = Field(ge=0, le=1)
    attention: list[float] | None = Field(default=None, max_length=100)


def summary(s: dict) -> dict:
    return {"id": str(s["_id"]), "content_id": str(s["content_id"]), "content_title": s.get("content_title", ""),
            "content_type": s.get("content_type"), "bed": s.get("bed"),
            "started_at": iso(s["started_at"]), "ended_at": iso(s.get("ended_at")),
            "reading_count": s.get("reading_count", 0), "average_score": s.get("average_score"),
            "species": SPECIES.get(s.get("content_type"), "fern"), **growth(s.get("focused_seconds", 0))}


async def get_session(session_id: str, user: dict) -> dict:
    s = await db.sessions.find_one({"_id": oid(session_id, "הסשן"), "user_id": user["_id"]})
    if not s:
        raise HTTPException(404, "הסשן לא נמצא")
    return s


@router.post("", status_code=201)
async def start(body: SessionIn, user: dict = Depends(current_user)):
    c = await get_owned(body.content_id, user)
    doc = {"user_id": user["_id"], "content_id": c["_id"], "content_title": c["title"], "content_type": c["type"],
           "bed": c.get("bed"), "started_at": now(), "ended_at": None, "reading_count": 0, "score_sum": 0.0,
           "average_score": None, "room_code": body.room_code, "focused_seconds": 0.0, "last_reading_at": None}
    res = await db.sessions.insert_one(doc)
    return {"id": str(res.inserted_id), "content_id": str(c["_id"]), "started_at": iso(doc["started_at"])}


@router.post("/{session_id}/readings", status_code=201)
async def add_reading(session_id: str, body: ReadingIn, user: dict = Depends(current_user)):
    s = await get_session(session_id, user)
    t = now()
    # time this reading accounts for (capped, so pauses/breaks don't count as focus)
    prev = s.get("last_reading_at") or s["started_at"]
    gap = min(config.MAX_READING_GAP, max(0.0, (t - prev).total_seconds()))
    focused = gap if body.score >= config.FOCUS_THRESHOLD else 0.0
    # atomic: only counts while the session is still open
    upd = await db.sessions.find_one_and_update(
        {"_id": s["_id"], "ended_at": None},
        {"$inc": {"reading_count": 1, "score_sum": body.score, "focused_seconds": focused},
         "$set": {"last_reading_at": t, "last_score": body.score}},
        return_document=True)
    if upd is None:
        raise HTTPException(409, "הסשן כבר הסתיים")
    r = {"session_id": s["_id"], "user_id": user["_id"], "position": body.position, "score": body.score,
         "created_at": t}
    if body.attention:
        r["attention"] = [round(float(x), 5) for x in body.attention]
    await db.readings.insert_one(r)
    return {"position": r["position"], "score": r["score"], "created_at": iso(r["created_at"]),
            **growth(upd.get("focused_seconds", 0))}


@router.post("/{session_id}/end")
async def end(session_id: str, user: dict = Depends(current_user)):
    s = await get_session(session_id, user)
    if not s.get("ended_at"):
        cnt = s.get("reading_count", 0)
        avg = round(s.get("score_sum", 0) / cnt, 4) if cnt else None
        await db.sessions.update_one({"_id": s["_id"], "ended_at": None},
                                     {"$set": {"ended_at": now(), "average_score": avg}})
        s = await get_session(session_id, user)
    out = summary(s)
    return {k: out[k] for k in ("id", "started_at", "ended_at", "reading_count", "average_score",
                                "focused_seconds", "level", "stage", "blooms", "species")}


@router.get("")
async def list_sessions(user: dict = Depends(current_user)):
    cur = db.sessions.find({"user_id": user["_id"]}).sort("started_at", -1).limit(500)
    return [summary(s) async for s in cur]


@router.get("/{session_id}")
async def get_one(session_id: str, user: dict = Depends(current_user)):
    s = await get_session(session_id, user)
    cur = db.readings.find({"session_id": s["_id"]}).sort("created_at", 1)
    readings = [{"score": r["score"], "position": r["position"], "created_at": iso(r["created_at"]),
                 **({"attention": r["attention"]} if r.get("attention") else {})} async for r in cur]
    return {**summary(s), "readings": readings}
