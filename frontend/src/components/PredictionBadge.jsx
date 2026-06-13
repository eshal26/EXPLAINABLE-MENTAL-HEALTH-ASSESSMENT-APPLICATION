import { COLORS } from "../utils/constants";

export function getLikelihoodLabel(confidence) {
  const value = Number(confidence || 0);

  if (value >= 85) {
    return "Very likely";
  }
  if (value >= 65) {
    return "Likely";
  }
  return "Possible";
}

export function getPredictionPhrase(label, confidence) {
  return `${getLikelihoodLabel(confidence)} ${label}`;
}

export default function PredictionBadge({ label, confidence, large = false }) {
  const isMdd = label === "Depressed";
  const likelihoodLabel = getLikelihoodLabel(confidence);

  return (
    <div
      className={`prediction-badge-card ${large ? "large" : ""}`}
      style={{
        borderColor: isMdd ? COLORS.danger : COLORS.success,
        color: isMdd ? COLORS.danger : COLORS.success,
      }}
    >
      <span className="prediction-badge-label">{label}</span>
      <span className="prediction-badge-confidence">{likelihoodLabel}</span>
    </div>
  );
}
