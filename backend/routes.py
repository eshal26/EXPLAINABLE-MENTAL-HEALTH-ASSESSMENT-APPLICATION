import asyncio
import json
import os
import tempfile
import threading
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from auth import create_access_token, get_current_user, hash_password, verify_password
from config import API_PREFIX
from db import create_user, get_subject_history, get_user_by_email, get_user_history
from job_runner import run_job
from job_store import create_job, request_cancel, require_job, save_job
from pdf_service import build_pdf_response


router = APIRouter(prefix=API_PREFIX)


class AuthCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


def auth_payload(user: dict) -> dict:
    public_user = {"id": user["id"], "email": user["email"]}
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": public_user,
    }


def require_owned_job(job_id: str, user: dict) -> dict:
    job = require_job(job_id)
    if job.get("user_id") != user["id"]:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/")
def api_root():
    return {
        "status": "ok",
        "message": "MentalMetrics API is available. Use /api/health, /api/analyze, /api/stream/{job_id}, /api/results/{job_id}, /api/history/{subject_id}, or /api/pdf/{job_id}.",
    }


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/auth/register")
def register(credentials: AuthCredentials):
    try:
        user = create_user(credentials.email, hash_password(credentials.password))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return auth_payload(user)


@router.post("/auth/login")
def login(credentials: AuthCredentials):
    user = get_user_by_email(credentials.email)
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return auth_payload(user)


@router.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": {"id": current_user["id"], "email": current_user["email"]}}


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    subject_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename.endswith(".edf"):
        raise HTTPException(400, "Only .edf files are supported")

    job_id = str(uuid.uuid4())
    tmp_dir = tempfile.mkdtemp()
    edf_path = os.path.join(tmp_dir, f"{job_id}.edf")

    contents = await file.read()
    with open(edf_path, "wb") as handle:
        handle.write(contents)

    save_job(job_id, create_job(subject_id, edf_path, user_id=current_user["id"]))
    start_job_thread(job_id, edf_path, subject_id)
    return {"job_id": job_id}


def start_job_thread(job_id: str, edf_path: str, subject_id: str) -> None:
    thread = threading.Thread(target=_run_job, args=(job_id, edf_path, subject_id))
    thread.daemon = True
    thread.start()


def _run_job(job_id: str, edf_path: str, subject_id: str):
    job = require_job(job_id)
    run_job(job_id, job, edf_path, subject_id)


@router.get("/stream/{job_id}")
async def stream(job_id: str, current_user: dict = Depends(get_current_user)):
    require_owned_job(job_id, current_user)

    async def event_generator():
        last_log_idx = 0
        while True:
            job = require_owned_job(job_id, current_user)
            logs = job["logs"]

            for log in logs[last_log_idx:]:
                yield f"data: {json.dumps(log)}\n\n"
                last_log_idx += 1

            if job["status"] == "done":
                payload = json.dumps(
                    {
                        "progress": 100,
                        "message": "done",
                        "result": job["result"],
                        "report": job["report"],
                    }
                )
                yield f"data: {payload}\n\n"
                break

            if job["status"] == "error":
                payload = json.dumps(
                    {
                        "progress": job["progress"],
                        "message": f"error: {job['error']}",
                    }
                )
                yield f"data: {payload}\n\n"
                break

            if job["status"] == "canceled":
                payload = json.dumps(
                    {
                        "progress": job["progress"],
                        "message": "canceled",
                    }
                )
                yield f"data: {payload}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/results/{job_id}")
def get_results(job_id: str, current_user: dict = Depends(get_current_user)):
    job = require_owned_job(job_id, current_user)
    if job["status"] != "done":
        raise HTTPException(400, f"Job status: {job['status']}")
    return {"result": job["result"], "report": job["report"]}


@router.post("/cancel/{job_id}")
def cancel_job(job_id: str, current_user: dict = Depends(get_current_user)):
    require_owned_job(job_id, current_user)
    job = request_cancel(job_id)
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
    }


@router.get("/history")
def user_history(current_user: dict = Depends(get_current_user), limit: int = 50):
    if limit < 1 or limit > 100:
        raise HTTPException(400, "limit must be between 1 and 100")
    analyses = get_user_history(current_user["id"], limit=limit)
    return {
        "user_id": current_user["id"],
        "count": len(analyses),
        "analyses": analyses,
    }


@router.get("/history/{subject_id}")
def subject_history(subject_id: str, limit: int = 20, current_user: dict = Depends(get_current_user)):
    if limit < 1 or limit > 100:
        raise HTTPException(400, "limit must be between 1 and 100")
    analyses = get_subject_history(subject_id, limit=limit, user_id=current_user["id"])
    return {
        "subject_id": subject_id,
        "count": len(analyses),
        "analyses": analyses,
    }


@router.get("/pdf/{job_id}")
def download_pdf(job_id: str, current_user: dict = Depends(get_current_user)):
    job = require_owned_job(job_id, current_user)
    if job["status"] != "done" or not job["result"]:
        raise HTTPException(400, "Analysis not complete")
    return build_pdf_response(job["result"], job["report"])
