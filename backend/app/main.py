import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine, Base
from backend.app.api.endpoints import router as api_router
from backend.app.utils.seed import seed_database_if_empty

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("backend/app.log")
    ]
)
logger = logging.getLogger("placement-scheduler")

# Initialize database schema tables on startup
logger.info("Initializing SQLite Database tables...")
Base.metadata.create_all(bind=engine)
seed_database_if_empty()

app = FastAPI(
    title="Placement Week Scheduling & Replanning System API",
    description="REST API for managing placement week schedules, KPIs, conflicts, and minimal-churn disruption replanning.",
    version="1.0.0"
)

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
