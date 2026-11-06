"""Bloom product endpoints: garden (plants from ended sessions), journal (insights), badges.
Everything is derived from sessions/readings on the server - nothing is trusted from the client."""
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from ..db import db
from ..growth import SPECIES, growth
from ..security import current_user
from ..utils import iso, now
from .rooms import shared_plants_for

router = APIRouter(tags=["bloom"])
NO_BED = "ללא ערוגה"


async def ended_sessions(user: dict, since=None) -> list[dict]:
    q = {"user_id": user["_id"], "ended_at": {"$ne": None}}
    if since:
        q["started_at"] = {"$gte": since}
    return [s async for s in db.sessions.find(q).sort("started_at", 1).limit(2000)]


def plant(s: dict) -> dict:
    g = growth(s.get("focused_seconds", 0))
    return {"session_id": str(s["_id"]), "title": s.get("content_title", ""), "content_type": s.get("content_type"),
            "species": SPECIES.get(s.get("content_type"), "fern"), "bed": s.get("bed") or NO_BED,
            "started_at": iso(s["started_at"]), "ended_at": iso(s.get("ended_at")),
            "average_score": s.get("average_score"), "reading_count": s.get("reading_count", 0),
            "focused_minutes": round(g["focused_seconds"] / 60, 1), **g}


def local_day(dt, tz_offset: int) -> date:
    # tz_offset = JS getTimezoneOffset() (minutes, UTC - local)
    return (dt - timedelta(minutes=tz_offset)).date()


def streak_days(days_with_plant: set[date], today: date) -> int:
    d = today if today in days_with_plant else today - timedelta(days=1)
    n = 0
    while d in days_with_plant:
        n += 1
        d -= timedelta(days=1)
    return n


@router.get("/garden")
async def garden(user: dict = Depends(current_user)):
    plants = [plant(s) for s in await ended_sessions(user)]
    beds: dict[str, dict] = {}
    for p in plants:
        b = beds.setdefault(p["bed"], {"name": p["bed"], "plants": [], "focused_minutes": 0.0, "_sum": 0.0, "_n": 0})
        b["plants"].append(p)
        b["focused_minutes"] += p["focused_minutes"]
        if p["average_score"] is not None:
            b["_sum"] += p["average_score"]
            b["_n"] += 1
    out = []
    for b in beds.values():
        b["average_score"] = round(b.pop("_sum") / b["_n"], 3) if b["_n"] else None
        b.pop("_n")
        b["focused_minutes"] = round(b["focused_minutes"], 1)
        b["plants"].reverse()  # newest first
        out.append(b)
    out.sort(key=lambda b: (b["name"] == NO_BED, -b["focused_minutes"]))
    return {"beds": out, "total_plants": len(plants), "flowers": sum(1 for p in plants if p["blooms"] > 0),
            "shared_plants": await shared_plants_for(user)}


def tips(minutes_by_day: list[dict], best_hour, by_bed: list[dict], streak: int, recent_avg, sessions: int) -> list[str]:
    t = []
    if sessions == 0:
        return ["עוד אין מספיק נתונים — התחילו סשן ראשון והגינה תתחיל לצמוח 🌱"]
    if sum(d["focused_minutes"] for d in minutes_by_day) == 0:
        t.append("הצמחים עוד לא גדלו — הם צומחים רק בדקות שבהן הציון 0.5 ומעלה. נסו סשן קצר וממוקד של 10 דקות.")
    if best_hour is not None:
        t.append(f"השעה הכי טובה שלך היא סביב {best_hour:02d}:00 — נסו לקבוע אז את החומר הקשה.")
    if streak >= 3:
        t.append(f"רצף של {streak} ימים! עוד יום אחד והגינה ממשיכה לפרוח.")
    elif streak == 0:
        t.append("היום עוד לא צמח כלום — אפילו 10 דקות מרוכזות שותלות צמח חדש.")
    weak = [b for b in by_bed if b["average_score"] is not None and b["average_score"] < 0.5]
    if weak:
        t.append(f"בערוגה \"{weak[0]['name']}\" הריכוז נמוך יותר — כדאי לחלק אותה לסשנים קצרים.")
    if recent_avg is not None and recent_avg >= 0.7:
        t.append("הממוצע האחרון שלך גבוה — מגיעה לך הפסקה אמיתית אחרי כל פריחה ☀️")
    elif recent_avg is not None and recent_avg < 0.4:
        t.append("הריכוז האחרון נמוך — נסו לסגור התראות בטלפון ולשבת מול המצלמה.")
    return t[:4]


@router.get("/journal")
async def journal(tz_offset: int = Query(0, ge=-840, le=840), user: dict = Depends(current_user)):
    today = local_day(now(), tz_offset)
    sessions = await ended_sessions(user)
    plants = [plant(s) for s in sessions]

    by_day = defaultdict(float)
    days_with_plant = set()
    for s, p in zip(sessions, plants):
        d = local_day(s["started_at"], tz_offset)
        by_day[d] += p["focused_minutes"]
        if p["level"] >= 1:
            days_with_plant.add(d)
    minutes_by_day = [{"date": (today - timedelta(days=i)).isoformat(),
                       "focused_minutes": round(by_day.get(today - timedelta(days=i), 0), 1)}
                      for i in range(13, -1, -1)]

    # best hour of the day: average score per local hour over the last 30 days
    since = now() - timedelta(days=30)
    hours = defaultdict(lambda: [0.0, 0])
    async for r in db.readings.find({"user_id": user["_id"], "created_at": {"$gte": since}}, {"score": 1, "created_at": 1}):
        h = (r["created_at"] - timedelta(minutes=tz_offset)).hour
        hours[h][0] += r["score"]
        hours[h][1] += 1
    hour_avg = {h: v[0] / v[1] for h, v in hours.items() if v[1] >= 3}
    best_hour = max(hour_avg, key=hour_avg.get) if hour_avg else None

    beds = defaultdict(lambda: [0.0, 0, 0.0])
    for p in plants:
        if p["average_score"] is not None:
            beds[p["bed"]][0] += p["average_score"]
            beds[p["bed"]][1] += 1
        beds[p["bed"]][2] += p["focused_minutes"]
    by_bed = [{"name": k, "average_score": round(v[0] / v[1], 3) if v[1] else None, "focused_minutes": round(v[2], 1)}
              for k, v in beds.items()]
    by_bed.sort(key=lambda b: -(b["average_score"] or 0))

    # attention strip: average v4_2 attention_weights per recent session ("which seconds counted most")
    strips = []
    for s in reversed(sessions[-6:]):
        acc, n = [0.0] * 100, 0
        async for r in db.readings.find({"session_id": s["_id"], "attention": {"$exists": True}}, {"attention": 1}):
            a = r["attention"]
            if len(a) == 100:
                acc = [x + y for x, y in zip(acc, a)]
                n += 1
        if n:
            m = max(acc) or 1
            strips.append({"session_id": str(s["_id"]), "title": s.get("content_title", ""),
                           "started_at": iso(s["started_at"]), "weights": [round(x / m, 3) for x in acc]})

    streak = streak_days(days_with_plant, today)
    recent = [p["average_score"] for p in plants[-5:] if p["average_score"] is not None]
    recent_avg = sum(recent) / len(recent) if recent else None
    return {"minutes_by_day": minutes_by_day, "best_hour": best_hour,
            "hour_averages": {str(h): round(v, 3) for h, v in sorted(hour_avg.items())},
            "by_bed": by_bed, "streak": streak, "attention_strips": strips,
            "tips": tips(minutes_by_day, best_hour, by_bed, streak, recent_avg, len(plants)),
            "totals": {"sessions": len(plants), "focused_minutes": round(sum(p["focused_minutes"] for p in plants), 1),
                       "flowers": sum(p["blooms"] for p in plants)}}


def season(month: int) -> dict:
    if month in (12, 1, 2):
        return {"key": "winter", "name": "חורף", "emoji": "❄️"}
    if month in (3, 4, 5):
        return {"key": "spring", "name": "אביב", "emoji": "🌸"}
    if month in (6, 7, 8):
        return {"key": "summer", "name": "קיץ", "emoji": "☀️"}
    return {"key": "autumn", "name": "סתיו", "emoji": "🍂"}


@router.get("/badges")
async def badges(tz_offset: int = Query(0, ge=-840, le=840), user: dict = Depends(current_user)):
    sessions = await ended_sessions(user)
    plants = [plant(s) for s in sessions]
    today = local_day(now(), tz_offset)
    days = {local_day(s["started_at"], tz_offset) for s, p in zip(sessions, plants) if p["level"] >= 1}
    bed_counts = defaultdict(int)
    for p in plants:
        if p["bed"] != NO_BED:
            bed_counts[p["bed"]] += 1
    shared = await db.users.find_one({"_id": user["_id"]}, {"shared_bloom": 1}) or {}
    defs = [
        ("first_seed", "זרע ראשון", "🌱", "סיימת סשן ראשון", len(plants) >= 1),
        ("first_flower", "פרח ראשון", "🌼", "צמח הגיע לפריחה מלאה", any(p["blooms"] > 0 for p in plants)),
        ("green_week", "שבוע ירוק", "🌿", "7 ימים ברצף עם צמח בגינה", streak_days(days, today) >= 7),
        ("full_bed", "ערוגה מלאה", "🪴", "5 צמחים באותה ערוגה", any(c >= 5 for c in bed_counts.values())),
        ("gold_focus", "ריכוז זהב", "🏅", "סשן עם ממוצע 0.8 ומעלה (10+ מדידות)",
         any((p["average_score"] or 0) >= 0.8 and p["reading_count"] >= 10 for p in plants)),
        ("gardener", "גנן/ת מתמיד/ה", "🧑‍🌾", "10 סשנים בגינה", len(plants) >= 10),
        ("bloomed_together", "פרחנו ביחד", "🤝", "פריחה משותפת עם חבר/ה", bool(shared.get("shared_bloom"))),
    ]
    return {"season": season(today.month),
            "badges": [{"id": i, "name": n, "emoji": e, "description": d, "earned": bool(ok)} for i, n, e, d, ok in defs]}
