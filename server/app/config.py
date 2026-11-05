import logging
import os
import secrets

log = logging.getLogger("bloom")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongo:27017")
DB_NAME = os.getenv("DB_NAME", "focusflow")
JWT_SECRET = os.getenv("JWT_SECRET") or ""
if not JWT_SECRET:
    # Only acceptable for a single local instance; production must set JWT_SECRET.
    log.warning("JWT_SECRET not set - generating an ephemeral secret")
    JWT_SECRET = secrets.token_urlsafe(48)
JWT_ALG = "HS256"
JWT_EXPIRES_MIN = 60
BCRYPT_ROUNDS = 12
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SEC = 15 * 60
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
