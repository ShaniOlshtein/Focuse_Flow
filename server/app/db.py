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
