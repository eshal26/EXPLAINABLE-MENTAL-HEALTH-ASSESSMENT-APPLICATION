import { CONCEPT_META } from "../utils/constants";

export default function Glossary({ onOpenConcept }) {
  const concepts = Object.values(CONCEPT_META);

  return (
    <div className="page-stack">
      <div className="glossary-grid">
        {concepts.map((concept) => (
          <button
            type="button"
            key={concept.key}
            className="card glossary-card"
            onClick={() => onOpenConcept(concept.key)}
          >
            <div className="section-label">{concept.label}</div>
            <h3 className="section-title">{concept.fullName}</h3>
            <div className="glossary-card-copy">{concept.description}</div>
            <div className="detail-block">
              <span className="detail-label">Channels</span>
              <span className="detail-value">{concept.channels}</span>
            </div>
            <div className="detail-block">
              <span className="detail-label">Band</span>
              <span className="detail-value">{concept.band}</span>
            </div>
            <div className="detail-block">
              <span className="detail-label">Clinical significance</span>
              <span className="detail-value">{concept.clinicalSignificance}</span>
            </div>
            <div className="detail-block">
              <span className="detail-label">Reference</span>
              <span className="detail-value">{concept.reference}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
