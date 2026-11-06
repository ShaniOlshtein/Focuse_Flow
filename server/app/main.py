import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .db import ensure_indexes
from .routes import auth, content, insights, rooms, sessions, users

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Bloom API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])

FIELD_NAMES = {"email": "אימייל", "password": "סיסמה", "display_name": "שם תצוגה", "title": "כותרת",
               "source": "מקור", "type": "סוג", "score": "ציון", "position": "מיקום",
               "new_password": "סיסמה חדשה", "current_password": "סיסמה נוכחית", "content_id": "תוכן"}


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    err = exc.errors()[0] if exc.errors() else {}
    loc = [str(x) for x in err.get("loc", []) if x not in ("body", "query", "path")]
    field = FIELD_NAMES.get(loc[-1], loc[-1]) if loc else ""
    msg = str(err.get("msg", "קלט לא תקין")).removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {msg}" if field else msg})


@app.exception_handler(StarletteHTTPException)
async def http_handler(_: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "שגיאה"
    if exc.status_code == 404 and detail == "Not Found":
        detail = "לא נמצא"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    logging.getLogger("bloom").exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "שגיאת שרת, נסו שוב"})


@app.on_event("startup")
async def startup():
    try:
        await ensure_indexes()
    except Exception:  # DB may still be starting; indexes are retried on next start
        logging.getLogger("bloom").exception("could not create indexes")


@app.get("/health")
async def health():
    return {"status": "ok"}


for r in (auth.router, users.router, content.router, sessions.router, insights.router, rooms.router):
    app.include_router(r, prefix="/api")
