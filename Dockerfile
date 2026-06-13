# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Backend, serves frontend too ----
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libglib2.0-0 libsm6 libxext6 libxrender1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir --default-timeout=1000 --retries=5 \
       --extra-index-url https://download.pytorch.org/whl/cpu \
       -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /app/frontend/dist ./static

RUN mkdir -p /app/explanation_results

ENV SQLITE_DB_PATH=/app/analysis_history.db \
    EXPLAIN_MODEL_PATH=/app/xceptiontime_mdd_v2_statedict.pt \
    EXPLAIN_CAV_BANK_DIR=/app/cav_bank \
    EXPLAIN_NPZ_PATH=/app/eeg_preprocessed.npz \
    EXPLAIN_OUTPUT_DIR=/app/explanation_results \
    AUTH_TOKEN_EXPIRE_MINUTES=480

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
