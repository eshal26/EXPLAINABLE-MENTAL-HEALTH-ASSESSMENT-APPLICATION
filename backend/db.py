import json
import sqlite3
from contextlib import contextmanager
from typing import Iterator

import bcrypt

from config import AUTH_BOOTSTRAP_EMAIL, AUTH_BOOTSTRAP_PASSWORD, SQLITE_DB_PATH


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(SQLITE_DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL UNIQUE,
                user_id INTEGER,
                subject_id TEXT NOT NULL,
                status TEXT NOT NULL,
                prediction_label TEXT,
                confidence REAL,
                result_json TEXT,
                report_json TEXT,
                error TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        _ensure_column(connection, "analyses", "user_id", "INTEGER")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_analyses_subject_id
            ON analyses(subject_id, completed_at DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_analyses_user_id
            ON analyses(user_id, completed_at DESC)
            """
        )
        ensure_bootstrap_user(connection)


def _ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_definition: str,
) -> None:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    if column_name not in {column["name"] for column in columns}:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")


def ensure_bootstrap_user(connection: sqlite3.Connection) -> None:
    if not AUTH_BOOTSTRAP_EMAIL or not AUTH_BOOTSTRAP_PASSWORD:
        return

    existing = connection.execute(
        "SELECT id FROM users WHERE email = ?",
        (AUTH_BOOTSTRAP_EMAIL.lower(),),
    ).fetchone()
    if existing:
        return

    password_hash = bcrypt.hashpw(
        AUTH_BOOTSTRAP_PASSWORD.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")
    connection.execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        (AUTH_BOOTSTRAP_EMAIL.lower(), password_hash),
    )


def save_analysis(
    job_id: str,
    subject_id: str,
    status: str,
    user_id: int | None = None,
    result: dict | None = None,
    report: dict | None = None,
    error: str | None = None,
) -> None:
    prediction_label = None
    confidence = None
    if result and result.get("prediction"):
        prediction_label = result["prediction"].get("label")
        confidence = result["prediction"].get("confidence")

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO analyses (
                job_id,
                user_id,
                subject_id,
                status,
                prediction_label,
                confidence,
                result_json,
                report_json,
                error,
                completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(job_id) DO UPDATE SET
                user_id = excluded.user_id,
                subject_id = excluded.subject_id,
                status = excluded.status,
                prediction_label = excluded.prediction_label,
                confidence = excluded.confidence,
                result_json = excluded.result_json,
                report_json = excluded.report_json,
                error = excluded.error,
                completed_at = CURRENT_TIMESTAMP
            """,
            (
                job_id,
                user_id,
                subject_id,
                status,
                prediction_label,
                confidence,
                json.dumps(result) if result else None,
                json.dumps(report) if report else None,
                error,
            ),
        )


def create_user(email: str, password_hash: str) -> dict:
    normalized_email = email.strip().lower()
    with get_connection() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (normalized_email, password_hash),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("A user with this email already exists") from exc
        user_id = cursor.lastrowid

    return {"id": user_id, "email": normalized_email}


def get_user_by_email(email: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, email, password_hash, created_at FROM users WHERE email = ?",
            (email.strip().lower(),),
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def get_subject_history(subject_id: str, limit: int = 20, user_id: int | None = None) -> list[dict]:
    where_clause = "WHERE subject_id = ?"
    params: list = [subject_id]
    if user_id is not None:
        where_clause += " AND user_id = ?"
        params.append(user_id)
    params.append(limit)

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
                job_id,
                user_id,
                subject_id,
                status,
                prediction_label,
                confidence,
                result_json,
                report_json,
                error,
                created_at,
                completed_at
            FROM analyses
            {where_clause}
            ORDER BY completed_at DESC, id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()

    return _serialize_analysis_rows(rows)


def get_user_history(user_id: int, limit: int = 50) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                job_id,
                user_id,
                subject_id,
                status,
                prediction_label,
                confidence,
                result_json,
                report_json,
                error,
                created_at,
                completed_at
            FROM analyses
            WHERE user_id = ?
            ORDER BY completed_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()

    return _serialize_analysis_rows(rows)


def _serialize_analysis_rows(rows: list[sqlite3.Row]) -> list[dict]:
    history = []
    for row in rows:
        history.append(
            {
                "job_id": row["job_id"],
                "user_id": row["user_id"],
                "subject_id": row["subject_id"],
                "status": row["status"],
                "prediction_label": row["prediction_label"],
                "confidence": row["confidence"],
                "result": json.loads(row["result_json"]) if row["result_json"] else None,
                "report": json.loads(row["report_json"]) if row["report_json"] else None,
                "error": row["error"],
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
            }
        )
    return history
