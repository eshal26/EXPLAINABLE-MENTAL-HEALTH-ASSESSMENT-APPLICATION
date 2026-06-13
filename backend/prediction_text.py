def get_likelihood_label(confidence: float | int | str | None) -> str:
    value = float(confidence or 0)
    if value >= 85:
        return "Very likely"
    if value >= 65:
        return "Likely"
    return "Possible"

def get_prediction_phrase(label: str, confidence: float | int | str | None) -> str:
    return f"{get_likelihood_label(confidence)} {label}"
