---
title: MentalMetrics
emoji: 🧠
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 3000
pinned: false
---
# MentalMetrics

MentalMetrics is a full-stack EEG analysis app for uploading `.edf` recordings, running an XceptionTime-based MDD vs HC classifier, generating concept-level explanations, and producing a structured clinical-style PDF report.

The app includes:

- FastAPI backend with authenticated analysis jobs
- React/Vite frontend for upload, progress tracking, results, and history
- XceptionTime model inference for subject-level prediction
- TCAV-style concept summaries from `explain_subject.py`
- Gemini-assisted report generation
- SQLite-backed user and analysis history
- PDF report download

## Prerequisites

- Docker and Docker Compose for the recommended setup
- Node.js and Python if running services locally
- A Gemini API key for report generation
- XceptionTime model artifact
- `cav_bank/` concept bank
- Optional `eeg_preprocessed.npz` training pool for CAV fallback

## Required Artifacts

By default, the backend expects these files or directories:

```text
backend/xceptiontime_mdd_v2_statedict.pt
backend/cav_bank/
backend/eeg_preprocessed.npz
```

`backend/eeg_preprocessed.npz` is optional when the CAV bank already contains every concept needed by the explanation pipeline.

## Environment

Create a root `.env` file before starting the app:

```bash
GEMINI_API_KEY=your_api_key_here
AUTH_SECRET_KEY=change-this-for-non-local-use
AUTH_BOOTSTRAP_EMAIL=admin@mentalmetrics.local
AUTH_BOOTSTRAP_PASSWORD=changeme
```

Optional runtime overrides:

```bash
GEMINI_MODEL=gemini-2.5-flash-lite
SQLITE_DB_PATH=backend/analysis_history.db
EXPLAIN_MODEL_PATH=backend/xceptiontime_mdd_v2_statedict.pt
EXPLAIN_CAV_BANK_DIR=backend/cav_bank
EXPLAIN_NPZ_PATH=backend/eeg_preprocessed.npz
EXPLAIN_OUTPUT_DIR=backend/explanation_results
AUTH_TOKEN_EXPIRE_MINUTES=480
```

When running with Docker Compose, backend paths are mounted inside the container under `/app`; the compose file already maps the default artifact locations.

## Run With Docker

```bash
docker-compose up --build
```

Then open:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/api/health`

## Run Locally

Backend:

```bash
cd backend
python -m venv .myenv
.\.myenv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend is configured to call `http://localhost:8000/api`.

## Usage

1. Register or sign in.
2. Upload a 19-channel `.edf` EEG recording.
3. Enter a subject ID.
4. Start the analysis job.
5. Watch progress while segmentation, prediction, explanation, and report generation run.
6. Review the prediction, concept markers, influence scores, and generated report.
7. Download the PDF report or revisit prior analyses from history.

## API Overview

All main API routes are under `/api`.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create a user and receive a bearer token |
| `POST` | `/api/auth/login` | Log in and receive a bearer token |
| `GET` | `/api/auth/me` | Return the current authenticated user |
| `POST` | `/api/analyze` | Upload an `.edf` file and start analysis |
| `GET` | `/api/stream/{job_id}` | Stream job progress with server-sent events |
| `GET` | `/api/results/{job_id}` | Fetch completed results |
| `POST` | `/api/cancel/{job_id}` | Cancel a running job |
| `GET` | `/api/history` | List the current user's analyses |
| `GET` | `/api/history/{subject_id}` | List analyses for a subject |
| `GET` | `/api/pdf/{job_id}` | Download a completed report as PDF |

Authenticated routes require:

```text
Authorization: Bearer <access_token>
```

## Concepts

| Concept | Notes |
|---|---|
| `FAA` | Frontal Alpha Asymmetry |
| `Theta` | Frontal theta power |
| `Alpha_Power` | Posterior alpha power |
| `Beta_Power` | Frontal-central beta power |
| `TBR` | Theta/Beta ratio |
| `Coherence` | Interhemispheric alpha coherence |

## Tests

Backend tests use Python's built-in unittest runner:

```bash
cd backend
python -m unittest discover tests
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Project Structure

```text
backend/
  auth.py                 Authentication helpers
  config.py               Environment and artifact configuration
  db.py                   SQLite users and analysis history
  explain_subject.py      EEG concept explanation pipeline
  job_runner.py           Background analysis execution
  job_store.py            In-memory job state
  main.py                 FastAPI app setup
  pdf_service.py          PDF response generation
  pipeline.py             Model artifact validation and analysis orchestration
  report.py               Report generation
  routes.py               API routes
  tests/                  Backend API tests
frontend/
  src/                    React application
  package.json            Frontend scripts and dependencies
docker-compose.yml        Full-stack Docker setup
README.md                 Project guide
```

## Notes

- This application is decision-support software and does not replace clinical judgment.
- `.edf` uploads are copied to a temporary directory for analysis.
- Generated outputs are written to `backend/explanation_results/` by default.
- Local databases, generated outputs, virtual environments, frontend build files, and secrets are ignored by git.
