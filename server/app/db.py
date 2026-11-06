from motor.motor_asyncio import AsyncIOMotorClient

from . import config

client = AsyncIOMotorClient(config.MONGODB_URI, serverSelectionTimeoutMS=5000, tz_aware=True)
db = client[config.DB_NAME]


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.content.create_index([("user_id", 1), ("created_at", -1)])
    await db.sessions.create_index([("user_id", 1), ("started_at", -1)])
    await db.readings.create_index([("session_id", 1), ("created_at", 1)])
    await db.token_denylist.create_index("expires_at", expireAfterSeconds=0)
    await db.token_denylist.create_index("jti", unique=True)
    await db.login_failures.create_index("created_at", expireAfterSeconds=15 * 60)
    await db.login_failures.create_index("key")
    await db.rooms.create_index("code", unique=True)
    await db.rooms.create_index("members.user_id")
    await db.rooms.create_index("last_activity", expireAfterSeconds=4 * 3600)  # room expires after 4 h idle
    await db.shared_plants.create_index("user_ids")
