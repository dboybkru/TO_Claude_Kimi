from fastapi import APIRouter

from app.api.v1.endpoints import auth, objects, users, tickets, journals, schedule, dashboard, seed, voice, audit, storage, call

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(objects.router)
api_router.include_router(users.router)
api_router.include_router(tickets.router)
api_router.include_router(journals.router)
api_router.include_router(schedule.router)
api_router.include_router(dashboard.router)
api_router.include_router(seed.router)
api_router.include_router(voice.router)
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(storage.router)
api_router.include_router(call.router)
