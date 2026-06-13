import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  getClinicalFlagColor,
  getConceptInterpretation,
  getConceptMeta,
} from "../utils/constants";

export default function ConceptBar({ concept, onOpenGlossary }) {
  const meta = getConceptMeta(concept.name) || { label: concept.name || 'Unknown', fullName: concept.name || 'Unknown', channels: '', band: '', key: concept.name || 'unknown' };
  const barColor = getClinicalFlagColor(concept.clinicalFlag) || '#888';
  const data = [{ name: meta.label, score: Number(((concept.tcavScore || 0) * 100).toFixed(1)) }];
  let strengthLabel;
  const tcav = concept.tcavScore || 0;
  if (tcav === 0) {
    strengthLabel = "Normal";
  } else if (tcav < 0.3) {
    strengthLabel = "Slight abnormality";
  } else if (tcav < 0.6) {
    strengthLabel = "Moderate abnormality";
  } else {
    strengthLabel = "Strong abnormality";
  }
  let directionLabel;
  const meanDd = concept.meanDd || 0;
  const mddDir = concept.mdd_direction || 'positive';
  if (meanDd > 0) {
    directionLabel = mddDir === 'positive' ? "Abnormal behaviour" : "Normal behaviour";
  } else if (meanDd < 0) {
    directionLabel = mddDir === 'positive' ? "Normal behaviour" : "Abnormal behaviour";
  } else {
    directionLabel = "Neutral behaviour";
  }

  const isReducedNormal = strengthLabel === "Normal";

  return (
    <div className={`concept-bar-card ${isReducedNormal ? 'reduced-normal' : ''}`}>
      <div className="concept-bar-header">
        <div className="concept-bar-heading">
          <button
            type="button"
            className="link-button concept-link"
            onClick={() => onOpenGlossary && onOpenGlossary(meta.key)}
          >
            {meta.label}
          </button>
          <div className="concept-bar-subtitle">{meta.fullName}</div>
        </div>
        <div className="concept-bar-accent" style={{ backgroundColor: barColor }} />
      </div>

      <div className="concept-bar-chart">
        <ResponsiveContainer width="100%" height={70}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" hide />
            <Bar dataKey="score" fill={barColor} radius={[6, 6, 6, 6]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
        {isReducedNormal && <div className="normal-indicator" />}
      </div>

      <div className="concept-stat-grid">
        <div className="concept-stat-card">
          <span className="concept-stat-label">{strengthLabel}</span>
          <span className="concept-stat-value">{data[0].score.toFixed(1)}%</span>
        </div>
        <div className="concept-stat-card">
          <span className="concept-stat-label">Physiologic shift</span>
          <span className="concept-stat-value">{directionLabel}</span>
        </div>
      </div>

      <div className="concept-bar-meta">
        <span>Directional value {meanDd >= 0 ? "+" : ""}{meanDd.toFixed(4)}</span>
        <span>{meta.channels}</span>
        <span>{meta.band}</span>
      </div>

      <p className="concept-interpretation">{getConceptInterpretation(concept) || "No interpretation available."}</p>
    </div>
  );
}
