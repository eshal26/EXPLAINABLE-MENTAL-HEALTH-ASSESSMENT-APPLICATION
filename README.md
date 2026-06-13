# EEG Xception Explanation Web App

Upload a subject `.edf` EEG file and get:
- subject-level `MDD` vs `HC` prediction from the XceptionTime model
- concept-level explanation summaries from `explain_subject.py`
- structured clinical report
- downloadable PDF report

## Setup

### 1. Prerequisites
- Docker and Docker Compose
- the XceptionTime state-dict model file
- the `cav_bank/` directory
- optionally the training NPZ pool if you want on-the-fly CAV fallback

### 2. Prepare backend artifacts
These are the default paths expected by the backend:

```text
backend/xceptiontime_mdd_v2_statedict.pt
backend/cav_bank/
backend/eeg_preprocessed.npz
```

The NPZ is optional when your CAV bank already contains all needed concepts.

### 3. Configure environment
```bash
cp .env.example .env
```

Set:
- `GEMINI_API_KEY` for report generation
- optional path overrides if your model or CAV bank live elsewhere

### 4. Build and run
```bash
docker-compose up --build
```

Open `http://localhost:3000`.

## Usage

1. Upload a 19-channel EDF recording.
2. Enter a subject ID.
3. Start the analysis.
4. Follow progress while the backend runs segmentation, prediction, concept explanation, and report generation.
5. Review the prediction summary, concept markers, and concept influence scores.
6. Open the generated report or download the PDF.

## Runtime configuration

These environment variables are supported:

```bash
GEMINI_API_KEY=
SQLITE_DB_PATH=
EXPLAIN_MODEL_PATH=
EXPLAIN_CAV_BANK_DIR=
EXPLAIN_NPZ_PATH=
EXPLAIN_OUTPUT_DIR=
```

## Concepts used by the new pipeline

| Concept | Notes |
|---|---|
| `FAA` | Frontal Alpha Asymmetry |
| `Theta` | Frontal theta power |
| `Alpha_Power` | Posterior alpha power |
| `Beta_Power` | Frontal-central beta power |
| `TBR` | Theta/Beta ratio |
| `Coherence` | Interhemispheric alpha coherence |

## Project structure

```text
backend/
  explain_subject.py
  pipeline.py
  report.py
  routes.py
  main.py
frontend/
docker-compose.yml
README.md
```
