import os

from config import (
    EXPLAIN_CAV_BANK_DIR,
    EXPLAIN_MODEL_PATH,
    EXPLAIN_NPZ_PATH,
    EXPLAIN_OUTPUT_DIR,
)

def validate_model_artifacts() -> None:
    if not os.path.exists(EXPLAIN_MODEL_PATH):
        raise FileNotFoundError(f"Explanation model not found at {EXPLAIN_MODEL_PATH}")

    cav_bank_exists = os.path.isdir(EXPLAIN_CAV_BANK_DIR)
    npz_exists = os.path.exists(EXPLAIN_NPZ_PATH)
    if not cav_bank_exists and not npz_exists:
        raise FileNotFoundError(
            "Need either a populated CAV bank directory or the training NPZ pool. "
            f"Checked {EXPLAIN_CAV_BANK_DIR} and {EXPLAIN_NPZ_PATH}."
        )

    os.makedirs(EXPLAIN_OUTPUT_DIR, exist_ok=True)

def _prediction_from_explanation(explanation: dict) -> dict:
    label = explanation["prediction"]
    mdd_prob = float(explanation["mdd_prob"])
    hc_prob = float(explanation["hc_prob"])
    display_label = "Depressed" if label == "MDD" else "Healthy"

    return {
        "label": display_label,
        "label_index": 1 if label == "MDD" else 0,
        "confidence": round(float(explanation["confidence"]) * 100, 1),
        "probabilities": [round(hc_prob * 100, 1), round(mdd_prob * 100, 1)],
        "raw_label": label,
    }

def _concept_summaries(explanation: dict) -> list[dict]:
    concepts = []
    for concept_name, concept_data in explanation.get("concepts", {}).items():
        tcav_score = float(concept_data.get("tcav_score", 0.0))
        mean_dd = float(concept_data.get("mean_dd", 0.0))
        std_dd = float(concept_data.get("std_dd", 0.0))
        cav_accuracy = float(concept_data.get("cav_accuracy", 0.0))
        flag = concept_data.get("clinical_flag", "WEAK")

        if flag == "STRONG_DRIVER":
            interpretation = "Strong contributor to the depressed-profile classification"
        elif flag == "MODERATE_DRIVER":
            interpretation = "Moderate contributor to the depressed-profile classification"
        elif flag == "SUPPRESSOR":
            interpretation = "Acts against the depressed-profile classification"
        elif flag == "NEUTRAL":
            interpretation = "Near-neutral influence on the prediction"
        else:
            interpretation = "Weak or inconsistent influence"

        concepts.append(
            {
                "concept_name": concept_name,
                "tcav_score": round(tcav_score, 4),
                "tcav_std": round(std_dd, 4),
                "mean_derivative": round(mean_dd, 6),
                "p_value": None,
                "cav_accuracy": round(cav_accuracy, 4),
                "significant": flag in {"STRONG_DRIVER", "MODERATE_DRIVER", "SUPPRESSOR"},
                "interpretation": interpretation,
                "clinical_flag": flag,
                "description": concept_data.get("description", ""),
                "reference": concept_data.get("reference", ""),
                "clinical_note": concept_data.get("clinical_note", ""),
                "mdd_direction": concept_data.get("mdd_direction", ""),
            }
        )

    concepts.sort(key=lambda item: abs(item["tcav_score"] - 0.5), reverse=True)
    return concepts

def _build_result(subject_id: str, explanation: dict) -> dict:
    prediction = _prediction_from_explanation(explanation)
    concept_summaries = _concept_summaries(explanation)

    return {
        "subject_id": subject_id,
        "prediction": prediction,
        "biomarkers": {
            "recording_seconds": explanation.get("recording_s"),
            "n_segments": explanation.get("n_segments"),
            "layer_used": explanation.get("layer_used"),
            "cav_bank_used": explanation.get("cav_bank_used"),
        },
        "tcav_concepts": concept_summaries,
        "concept_summaries": concept_summaries,
        "n_segments": explanation.get("n_segments"),
        "sampling_rate": 256,
        "channels_found": 19,
        "output_files": explanation.get("output_files", {}),
        "raw_explanation": explanation,
    }

def run_subject_pipeline(edf_path: str, subject_id: str):
    """
    Generator that yields (progress_pct, log_message) tuples,
    then finally yields (100, result_dict).
    """
    yield 5, "Preparing analysis…"
    validate_model_artifacts()

    yield 12, "Loading analysis components…"
    if os.path.isdir(EXPLAIN_CAV_BANK_DIR):
        yield 18, "Using reference concept library…"
    else:
        yield 18, "Preparing concept reference data…"

    yield 25, "Running clinical EEG analysis…"
    yield 12, "Checking model and concept files."
    validate_model_artifacts()

    yield 18, "Model files loaded."
    if os.path.isdir(EXPLAIN_CAV_BANK_DIR):
        yield 25, "Reference concept library loaded."
    else:
        yield 25, "Preparing concept reference data."

    yield 35, "Running EEG segmentation, prediction, and concept analysis."

    from explain_subject import explain_subject

    explanation = explain_subject(
        edf_path=edf_path,
        model_path=EXPLAIN_MODEL_PATH,
        npz_path=EXPLAIN_NPZ_PATH,
        out_dir=EXPLAIN_OUTPUT_DIR,
        cav_bank_dir=EXPLAIN_CAV_BANK_DIR,
    )

    yield 88, "Preparing clinical summary…"
    yield 88, "Preparing structured analysis results."
    result = _build_result(subject_id, explanation)
    yield 100, result
