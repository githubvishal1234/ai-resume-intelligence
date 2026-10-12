from fastapi import APIRouter

from app.api.v1 import health, system
from app.auth.router import router as auth_router
from app.jobs.router import router as jobs_router
from app.matching.router import router as matching_router
from app.resumes.router import router as resumes_router
from app.tailoring.router import router as tailoring_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth_router)
api_router.include_router(system.router)
api_router.include_router(resumes_router)
api_router.include_router(jobs_router)
api_router.include_router(matching_router)
api_router.include_router(tailoring_router)
