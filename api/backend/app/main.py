import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine, Base
from backend.app.api.endpoints import router as api_router
from backend.app.utils.seed import seed_database_if_empty

# Set up logging configuration
import os
log_handlers = [logging.StreamHandler()]
if os.getenv("VERCEL") != "1":
    try:
        log_handlers.append(logging.FileHandler("backend/app.log"))
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=log_handlers
)
logger = logging.getLogger("placement-scheduler")

app = FastAPI(
    title="Placement Week Scheduling & Replanning System API",
    description="REST API for managing placement week schedules, KPIs, conflicts, and minimal-churn disruption replanning.",
    version="1.0.0"
)

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database tables and checking seed data...")
    Base.metadata.create_all(bind=engine)
    seed_database_if_empty()

# Set up CORS middleware to allow connection from Vite/React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev simplicity, allow all. In production, restrict this.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API router
app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Placement Week Scheduler API is online. Go to /docs for Swagger documentation."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
