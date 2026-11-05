from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def oid(value: str, what: str = "הפריט") -> ObjectId:
    """Parse an id; invalid ids are simply 'not found' (never leak existence)."""
    if not ObjectId.is_valid(value):
        raise HTTPException(404, f"{what} לא נמצא")
    return ObjectId(value)
