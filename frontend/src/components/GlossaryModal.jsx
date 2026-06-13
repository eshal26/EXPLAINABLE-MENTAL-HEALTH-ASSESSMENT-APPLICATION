import { getConceptMeta } from "../utils/constants";

export default function GlossaryModal({ conceptName, onClose }) {
  if (!conceptName) {
    return null;
  }

  const meta = getConceptMeta(conceptName);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-label">Concept glossary</p>
            <h3 className="section-title">{meta.fullName}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="glossary-detail-grid">
          <div className="detail-block">
            <span className="detail-label">Description</span>
            <span className="detail-value">{meta.description}</span>
          </div>
          <div className="detail-block">
            <span className="detail-label">Channels</span>
            <span className="detail-value">{meta.channels}</span>
          </div>
          <div className="detail-block">
            <span className="detail-label">Frequency band</span>
            <span className="detail-value">{meta.band}</span>
          </div>
          <div className="detail-block">
            <span className="detail-label">Clinical significance</span>
            <span className="detail-value">{meta.clinicalSignificance}</span>
          </div>
          <div className="detail-block">
            <span className="detail-label">Reference</span>
            <span className="detail-value">{meta.reference}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
