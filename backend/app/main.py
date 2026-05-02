from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.router import api_router
from app import crud
from app.database import AsyncSessionLocal, engine, Base, is_sqlite
from app.schemas.user import UserCreate
from app.models.user import UserRole

# Import all models so Base knows about them for create_all
from app.models import user, object, repair_ticket, maintenance_journal, maintenance_schedule  # noqa

# ── Sentry (optional — install sentry-sdk[fastapi] if SENTRY_DSN is set) ─────
if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            traces_sample_rate=0.2,
            profiles_sample_rate=0.1,
        )
    except ImportError:
        pass  # sentry-sdk not installed — pip install sentry-sdk[fastapi]

# ── Rate Limiter (optional — install slowapi if not present) ──────────────────
try:
    from slowapi.errors import RateLimitExceeded
    from app.core.limiter import limiter
    _slowapi_available = True
except ImportError:
    _slowapi_available = False
    limiter = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    if is_sqlite:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    await _create_first_superuser()
    yield


async def _create_first_superuser():
    async with AsyncSessionLocal() as db:
        existing = await crud.user.get_by_email(db, email=settings.FIRST_SUPERUSER_EMAIL)
        if not existing:
            await crud.user.create(
                db,
                obj_in=UserCreate(
                    email=settings.FIRST_SUPERUSER_EMAIL,
                    password=settings.FIRST_SUPERUSER_PASSWORD,
                    full_name="Super Admin",
                    role=UserRole.ADMIN,
                ),
            )


app = FastAPI(
    title="Alarm & ACS Maintenance API",
    description="Система технического обслуживания охранной сигнализации и СКУД",
    version="1.0.0",
    lifespan=lifespan,
)


# Custom rate limit handler with Retry-After header
async def _custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    retry_after = getattr(exc, 'retry_after', None)
    if retry_after is None and hasattr(exc, 'limit') and hasattr(exc.limit, 'get_expiry'):
        retry_after = int(exc.limit.get_expiry())
    if retry_after is None:
        retry_after = 60
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
        headers={"Retry-After": str(retry_after)},
    )


if _slowapi_available and limiter is not None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _custom_rate_limit_handler)


# ── Audit Log Middleware ─────────────────────────────────────────────────────
AUDIT_EXCLUDED_PATHS = {"/health", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/me"}
AUDIT_MUTATE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    response = await call_next(request)

    method = request.method
    path = request.url.path

    if method in AUDIT_MUTATE_METHODS and not any(path.startswith(p) for p in AUDIT_EXCLUDED_PATHS):
        try:
            user_id = None
            if hasattr(request.state, "user") and request.state.user:
                user_id = getattr(request.state.user, "id", None)

            # Extract resource_id from path if UUID present
            resource_id = None
            parts = path.strip("/").split("/")
            for part in parts:
                if len(part) == 36 and part.count("-") == 4:
                    resource_id = part
                    break

            # Fire-and-forget background audit write
            from starlette.background import BackgroundTask
            from app.database import AsyncSessionLocal
            from app.models.audit_log import AuditLog

            async def _write_audit():
                async with AsyncSessionLocal() as db:
                    audit = AuditLog(
                        user_id=user_id,
                        action=f"{method.lower()}_{parts[-1] if parts else 'unknown'}",
                        resource=path,
                        resource_id=resource_id,
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent"),
                        details=f"{method} {path}",
                    )
                    db.add(audit)
                    await db.commit()

            if hasattr(response, "background"):
                response.background = BackgroundTask(_write_audit)
        except Exception:
            pass  # Never fail request because of audit logging

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Webhook-Signature"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "rate_limiting": _slowapi_available,
        "monitoring": bool(settings.SENTRY_DSN),
    }
