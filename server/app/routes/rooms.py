"""Shared garden ("לומדים ביחד"): study rooms with short polling.
All state lives in Mongo (works with several stateless Cloud Run instances, no sticky sessions).
Only display name, focus score and plant stage are shared - never video or landmarks."""
import secrets
import uuid

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .. import config
from ..db import db
from ..growth import growth
from ..security import current_user
from ..utils import iso, now, oid

router = APIRouter(prefix="/rooms", tags=["rooms"])
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
MAX_MEMBERS = 4
STALE_SEC = 20  # no reading/presence for this long -> "not in front of the camera"
CHEER_WINDOW_SEC = 30


class JoinIn(BaseModel):
    consent: bool = False
    session_id: str | None = Field(default=None, max_length=64)


class PresenceIn(BaseModel):
    state: Literal["active", "noface", "break", "idle"]
    session_id: str | None = Field(default=None, max_length=64)


def norm(code: str) -> str:
    return code.strip().upper()[:12]


async def attach_session(session_id: str | None, user: dict, code: str):
    if not session_id:
        return
    await db.sessions.update_one({"_id": oid(session_id, "הסשן"), "user_id": user["_id"], "ended_at": None},
                                 {"$set": {"room_code": code}})


def new_member(user: dict) -> dict:
    t = now()
    return {"user_id": user["_id"], "display_name": user["display_name"], "joined_at": t, "updated_at": t,
            "level": 0, "stage": "seed", "last_score": None, "presence": "idle", "bloomed": False}


async def member_room(code: str, user: dict) -> dict:
    room = await db.rooms.find_one({"code": norm(code), "members.user_id": user["_id"]})
    if not room:  # missing, expired or not a member -> the same 404 (no existence leak)
        raise HTTPException(404, "החדר לא נמצא או שאינך חבר/ה בו")
    return room


def status_of(m: dict) -> tuple[str, str]:
    t = now()
    if m.get("presence") == "break":
        return "break", "בהפסקה"
    if m.get("presence") == "idle":
        return "idle", "עוד לא התחיל/ה סשן"
    stale = (t - m.get("updated_at", t)).total_seconds() > STALE_SEC
    if m.get("presence") == "noface" or stale or m.get("last_score") is None:
        return "away", "לא מול המצלמה"
    if m["last_score"] < 0.4:
        return "needs_cheer", "צריך/ה עידוד"
    return "focused", "מרוכז/ת"


def room_out(room: dict, user: dict) -> dict:
    t = now()
    members = []
    for m in room["members"]:
        key, label = status_of(m)
        members.append({"display_name": m["display_name"], "stage": m["stage"], "level": m["level"],
                        "last_score": m["last_score"], "status": key, "status_label": label,
                        "updated_at": iso(m["updated_at"]), "is_me": m["user_id"] == user["_id"]})
    cheers = [{"id": c["id"], "from": c["from_name"], "at": iso(c["at"])} for c in room.get("cheers", [])
              if c["to"] == user["_id"] and (t - c["at"]).total_seconds() < CHEER_WINDOW_SEC]
    return {"code": room["code"], "members": members, "cheers": cheers, "max_members": MAX_MEMBERS,
            "shared_bloom": room.get("shared_bloom", False), "expires_after_hours": 4}


@router.post("", status_code=201)
async def create(body: JoinIn | None = None, user: dict = Depends(current_user)):
    for _ in range(10):
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if not await db.rooms.find_one({"code": code}):
            break
    t = now()
    room = {"code": code, "created_by": user["_id"], "created_at": t, "last_activity": t,
            "members": [new_member(user)], "cheers": [], "shared_bloom": False}
    await db.rooms.insert_one(room)
    await attach_session(body.session_id if body else None, user, code)
    return {**room_out(room, user), "link": f"/room/{code}"}


@router.post("/{code}/join")
async def join(code: str, body: JoinIn, user: dict = Depends(current_user)):
    if not body.consent:
        raise HTTPException(422, "יש לאשר את תנאי השיתוף לפני ההצטרפות")
    code = norm(code)
    room = await db.rooms.find_one({"code": code})
    if not room:
        raise HTTPException(404, "החדר לא נמצא (אולי פג תוקפו)")
    if not any(m["user_id"] == user["_id"] for m in room["members"]):
        # atomic "max 4 members" check
        res = await db.rooms.update_one(
            {"code": code, "members.user_id": {"$ne": user["_id"]}, f"members.{MAX_MEMBERS - 1}": {"$exists": False}},
            {"$push": {"members": new_member(user)}, "$set": {"last_activity": now()}})
        if res.modified_count == 0:
            raise HTTPException(409, "החדר מלא (עד 4 משתתפים)")
    await attach_session(body.session_id, user, code)
    return room_out(await member_room(code, user), user)


@router.post("/{code}/leave", status_code=204)
async def leave(code: str, user: dict = Depends(current_user)):
    room = await member_room(code, user)
    await db.rooms.update_one({"_id": room["_id"]}, {"$pull": {"members": {"user_id": user["_id"]}},
                                                     "$set": {"last_activity": now()}})
    await db.sessions.update_many({"user_id": user["_id"], "room_code": room["code"], "ended_at": None},
                                  {"$set": {"room_code": None}})
    return Response(status_code=204)


@router.get("/{code}")
async def get_room(code: str, user: dict = Depends(current_user)):
    return room_out(await member_room(code, user), user)


@router.post("/{code}/presence")
async def presence(code: str, body: PresenceIn, user: dict = Depends(current_user)):
    room = await member_room(code, user)
    await attach_session(body.session_id, user, room["code"])
    t = now()
    await db.rooms.update_one({"_id": room["_id"], "members.user_id": user["_id"]},
                              {"$set": {"members.$.presence": body.state, "members.$.updated_at": t, "last_activity": t}})
    return room_out(await member_room(code, user), user)


@router.post("/{code}/cheer")
async def cheer(code: str, user: dict = Depends(current_user)):
    room = await member_room(code, user)
    t = now()
    recent = [c for c in room.get("cheers", []) if c["from"] == user["_id"] and (t - c["at"]).total_seconds() < 3]
    if recent:
        raise HTTPException(429, "רגע… העידוד הקודם עוד בדרך ☀️")
    cheers = [{"id": uuid.uuid4().hex[:10], "from": user["_id"], "from_name": user["display_name"], "to": m["user_id"], "at": t}
              for m in room["members"] if m["user_id"] != user["_id"]]
    if cheers:
        await db.rooms.update_one({"_id": room["_id"]}, {"$push": {"cheers": {"$each": cheers, "$slice": -40}},
                                                         "$set": {"last_activity": t}})
    return {"sent": len(cheers)}


async def on_reading(session: dict, focused_seconds: float, score: float):
    """Called by the readings endpoint: the server (not the client) updates the member's plant in the room."""
    code = session.get("room_code")
    if not code:
        return
    g = growth(focused_seconds)
    t = now()
    upd = {"members.$.level": g["level"], "members.$.stage": g["stage"], "members.$.last_score": score,
           "members.$.updated_at": t, "members.$.presence": "active", "last_activity": t}
    if g["level"] >= config.BLOOM_LEVEL:
        upd["members.$.bloomed"] = True
    await db.rooms.update_one({"code": code, "members.user_id": session["user_id"]}, {"$set": upd})
    if g["level"] >= config.BLOOM_LEVEL:
        await check_shared_bloom(code)


async def check_shared_bloom(code: str):
    room = await db.rooms.find_one({"code": code})
    if not room or room.get("shared_bloom"):
        return
    bloomed = [m for m in room["members"] if m.get("bloomed")]
    if len(bloomed) >= 2 and len(bloomed) == len(room["members"]):
        res = await db.rooms.update_one({"_id": room["_id"], "shared_bloom": {"$ne": True}}, {"$set": {"shared_bloom": True}})
        if res.modified_count:  # only one instance creates the joint plant
            ids = [m["user_id"] for m in bloomed]
            await db.shared_plants.insert_one({"room_code": code, "user_ids": ids, "names": [m["display_name"] for m in bloomed],
                                               "created_at": now()})
            await db.users.update_many({"_id": {"$in": ids}}, {"$set": {"shared_bloom": True}})


async def shared_plants_for(user: dict) -> list[dict]:
    return [{"room_code": p["room_code"], "names": p["names"], "created_at": iso(p["created_at"])}
            async for p in db.shared_plants.find({"user_ids": user["_id"]}).sort("created_at", -1).limit(50)]


