from typing import Any, Dict

from fastapi import HTTPException


jobs: Dict[str, Any] = {}


def create_job(subject_id: str, edf_path: str, user_id: int | None = None) -> Dict[str, Any]:
    return {
        "status": "running",
        "progress": 8,
        "logs": [{"progress": 8, "message": "Upload saved. Analysis job queued."}],
        "result": None,
        "report": None,
        "error": None,
        "cancel_requested": False,
        "user_id": user_id,
        "subject_id": subject_id,
        "edf_path": edf_path,
    }


def save_job(job_id: str, job: Dict[str, Any]) -> None:
    jobs[job_id] = job


def has_job(job_id: str) -> bool:
    return job_id in jobs


def get_job(job_id: str) -> Dict[str, Any] | None:
    return jobs.get(job_id)


def require_job(job_id: str) -> Dict[str, Any]:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


def request_cancel(job_id: str) -> Dict[str, Any]:
    job = require_job(job_id)
    if job["status"] in {"done", "error", "canceled"}:
        return job
    job["cancel_requested"] = True
    job["status"] = "canceled"
    job["progress"] = min(job.get("progress", 0), 99)
    job["logs"].append(
        {
            "progress": job["progress"],
            "message": "Analysis canceled by user.",
        }
    )
    return job
