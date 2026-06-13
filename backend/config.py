import os

BACKEND_DIR = os.path.dirname(__file__)

def _load_local_env() -> None:
    env_path = os.path.join(os.path.dirname(BACKEND_DIR), ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)

_load_local_env()
API_PREFIX = "/api"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", os.path.join(BACKEND_DIR, "analysis_history.db"))
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "change-this-development-secret")
AUTH_TOKEN_EXPIRE_MINUTES = int(os.getenv("AUTH_TOKEN_EXPIRE_MINUTES", "480"))
AUTH_BOOTSTRAP_EMAIL = os.getenv("AUTH_BOOTSTRAP_EMAIL", "admin@mentalmetrics.local")
AUTH_BOOTSTRAP_PASSWORD = os.getenv("AUTH_BOOTSTRAP_PASSWORD", "changeme")
EXPLAIN_MODEL_PATH = os.getenv(
    "EXPLAIN_MODEL_PATH",
    os.path.join(BACKEND_DIR, "xceptiontime_mdd_v2_statedict.pt"),
)
EXPLAIN_NPZ_PATH = os.getenv(
    "EXPLAIN_NPZ_PATH",
    os.path.join(BACKEND_DIR, "eeg_preprocessed.npz"),
)
EXPLAIN_CAV_BANK_DIR = os.getenv(
    "EXPLAIN_CAV_BANK_DIR",
    os.path.join(BACKEND_DIR, "cav_bank"),
)
EXPLAIN_OUTPUT_DIR = os.getenv(
    "EXPLAIN_OUTPUT_DIR",
    os.path.join(BACKEND_DIR, "explanation_results"),
)
GEMINI_MODEL_URL = os.getenv(
    "GEMINI_MODEL_URL",
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
)
