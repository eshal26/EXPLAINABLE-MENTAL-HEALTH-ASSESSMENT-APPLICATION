from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from pipeline import validate_model_artifacts
from routes import router

app = FastAPI(title="MentalMetrics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

@app.get("/")
def root() -> dict[str, str]:
    return {
        "status": "ok",
        "message": "MentalMetrics API is running. Use /api/health and /api/... endpoints.",
    }

@app.on_event("startup")
def on_startup() -> None:
    init_db()
    validate_model_artifacts()
