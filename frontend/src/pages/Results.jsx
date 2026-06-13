import { useState } from "react";
import ConceptBar from "../components/ConceptBar";
import GlossaryModal from "../components/GlossaryModal";
import PredictionBadge from "../components/PredictionBadge";

const API_BASE = "http://localhost:8000/api";

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function isSimpleKeyValueLine(line) {
  const kvMatch = line.match(/^([A-Za-z][^:]{0,50}):\s+(.+)$/);
  if (!kvMatch) {
    return false;
  }

  const [, label, value] = kvMatch;
  if (value.includes(":")) {
    return false;
  }
  if (/[(),;]/.test(label)) {
    return false;
  }

  return true;
}

function renderLeadInParagraph(line, key) {
  const leadMatch = line.match(/^([^:]{1,160}:)\s+(.+)$/);
  if (!leadMatch) {
    return (
      <p key={key} className="rc-paragraph">
        {renderInline(line)}
      </p>
    );
  }

  const [, lead, remainder] = leadMatch;
  return (
    <p key={key} className="rc-paragraph">
      <strong className="rc-lead">{renderInline(lead)}</strong>{" "}
      {renderInline(remainder)}
    </p>
  );
}

function ReportContent({ content, sectionTitle }) {
  if (!content) return null;

  const lines = content.split("\n").map((l) => l.trimEnd());
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const text = line.replace(/^#+\s*/, "");
      elements.push(
        <h5 key={i} className="rc-subheading">
          {renderInline(text)}
        </h5>
      );
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(
          <li key={i}>{renderInline(lines[i].replace(/^[-*]\s/, ""))}</li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="rc-list">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(
          <li key={i}>{renderInline(lines[i].replace(/^\d+[.)]\s/, ""))}</li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="rc-list rc-list--ordered">
          {items}
        </ol>
      );
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z][^:]{0,50}):\s+(.+)$/);
    if (kvMatch && isSimpleKeyValueLine(line)) {
      elements.push(
        <div key={i} className="rc-kv">
          <span className="rc-kv__label">{kvMatch[1]}</span>
          <span className="rc-kv__value">{renderInline(kvMatch[2])}</span>
        </div>
      );
      i++;
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+[.)]\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const paragraph = paraLines.join(" ");
    const shouldUseLeadIn =
      sectionTitle !== "Patient & Recording Information" &&
      /^[^:]{1,160}:\s+/.test(paragraph);

    elements.push(
      shouldUseLeadIn
        ? renderLeadInParagraph(paragraph, `p-${i}`)
        : (
          <p key={`p-${i}`} className="rc-paragraph">
            {renderInline(paragraph)}
          </p>
        )
    );
  }

  return <>{elements}</>;
}

const SECTION_ICONS = {
  "Patient & Recording Information": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="7" r="3" />
      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" strokeLinecap="round" />
    </svg>
  ),
  "Clinical Summary": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2v4M10 14v4M2 10h4M14 10h4" strokeLinecap="round" />
      <circle cx="10" cy="10" r="4" />
    </svg>
  ),
  "Biomarker Interpretation": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 14l4-5 3 3 3-6 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "Clinical Interpretation": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 3a7 7 0 100 14A7 7 0 0010 3z" />
      <path d="M10 9v2M10 13h.01" strokeLinecap="round" />
    </svg>
  ),
  "Safety Disclaimer": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" strokeLinejoin="round" />
      <path d="M10 8v3M10 13h.01" strokeLinecap="round" />
    </svg>
  ),
};

function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div className="card">
      <button type="button" className="collapse-header" onClick={onToggle}>
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPrintableReportDocument(analysis, reportSections) {
  const sectionsHtml = reportSections.map((section) => `
    <section class="print-section ${section.title === "Safety Disclaimer" ? "print-section-disclaimer" : ""}">
      <h2>${escapeHtml(section.title)}</h2>
      <div class="print-copy">${escapeHtml(section.content).replace(/\n/g, "<br />")}</div>
    </section>
  `).join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>MentalMetrics Clinical Report</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          margin: 32px;
          color: #1f2937;
          background: #ffffff;
        }
        .print-header {
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .print-header h1 {
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 500;
        }
        .print-meta {
          font-size: 13px;
          color: #5f5e5a;
          line-height: 1.6;
        }
        .print-section {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 16px;
        }
        .print-section-disclaimer {
          background: #fffbeb;
        }
        .print-section h2 {
          margin: 0 0 10px;
          font-size: 14px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #185FA5;
        }
        .print-copy {
          font-size: 14px;
          line-height: 1.7;
          white-space: normal;
        }
      </style>
    </head>
    <body>
      <header class="print-header">
        <h1>MentalMetrics Clinical Report</h1>
        <div class="print-meta">Subject: ${escapeHtml(analysis.subject)}</div>
        <div class="print-meta">Generated: ${escapeHtml(new Date(analysis.createdAt).toLocaleString())}</div>
      </header>
      ${sectionsHtml}
    </body>
  </html>`;
}

function formatReportSections(analysis) {
  if (analysis.reportSections) {
    const mergedClinicalInterpretation = [
      analysis.reportSections.key_findings,
      analysis.reportSections.clinical_interpretation,
    ].filter((value) => value?.trim()).join("\n\n");

    const structured = [
      { title: "Patient & Recording Information", key: "patient_recording_information", content: analysis.reportSections.patient_recording_information },
      { title: "Clinical Summary", key: "model_prediction_summary", content: analysis.reportSections.model_prediction_summary },
      { title: "Biomarker Interpretation", key: "concept_based_explanation", content: analysis.reportSections.concept_based_explanation },
      { title: "Clinical Interpretation", key: "clinical_interpretation", content: mergedClinicalInterpretation },
      { title: "Safety Disclaimer", key: "safety_disclaimer", content: analysis.reportSections.safety_disclaimer },
    ];
    const hasContent = structured.some((s) => s.content?.trim());
    if (hasContent) return structured;
    if (analysis.reportSections.raw_report_text) {
      return [{ title: "Clinical Report", key: "raw", content: analysis.reportSections.raw_report_text }];
    }
  }
  if (analysis.reportText) {
    return [{ title: "Clinical Report", key: "raw", content: analysis.reportText }];
  }
  return [];
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${(numeric * 100).toFixed(1)}%`;
}

export default function Results({ analysis, authToken }) {
  const [openSections, setOpenSections] = useState({
    summary: true,
    report: false,
    sensitivity: true,
  });
  const [modalConcept, setModalConcept] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  if (!analysis) {
    return <div className="card empty-state">No results are loaded yet.</div>;
  }

  const reportSections = formatReportSections(analysis);

  const handleCopy = () => {
    const text = reportSections
      .map((s) => `${s.title}\n${"─".repeat(s.title.length)}\n${s.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  const handleDownloadPdf = () => {
    if (analysis.jobId) {
      const tokenQuery = authToken ? `?token=${encodeURIComponent(authToken)}` : "";
      window.open(`${API_BASE}/pdf/${analysis.jobId}${tokenQuery}`, "_blank", "noopener,noreferrer");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPrintableReportDocument(analysis, reportSections));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <>
      <style>{REPORT_STYLES}</style>

      <div className="page-stack">
        <CollapsibleSection
          title="Prediction Summary"
          open={openSections.summary}
          onToggle={() => setOpenSections((p) => ({ ...p, summary: !p.summary }))}
        >
          <div className="prediction-summary-grid">
            <PredictionBadge label={analysis.prediction} confidence={analysis.confidence} large />
            <div className="stat-strip">
              <StatCard label="Depressed probability" value={formatPercent(analysis.mddProb)} />
              <StatCard label="Healthy probability" value={formatPercent(analysis.hcProb)} />
              <StatCard label="Recording duration" value={`${analysis.recordingSeconds}s`} />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Biomarker Interpretation"
          open={openSections.sensitivity}
          onToggle={() => setOpenSections((p) => ({ ...p, sensitivity: !p.sensitivity }))}
        >
          <div className="concept-grid">
            {analysis.concepts.map((concept) => (
              <ConceptBar
                key={concept.name}
                concept={concept}
                onOpenGlossary={setModalConcept}
              />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Clinical Report"
          open={openSections.report}
          onToggle={() => setOpenSections((p) => ({ ...p, report: !p.report }))}
        >
          <div className="report-toolbar">
            <div>
              <div className="report-title">{analysis.subject}</div>
              <div className="report-meta">
                {new Date(analysis.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => setReportModalOpen(true)}>
                Show report
              </button>
              <button type="button" className="primary-button" onClick={handleDownloadPdf}>
                Download as PDF
              </button>
            </div>
          </div>
          <div className="report-preview-note">
            Open the formatted clinical report in a focused view for reading, copying, or downloading.
          </div>
        </CollapsibleSection>

        {reportModalOpen && (
          <div className="report-modal-overlay" onClick={() => setReportModalOpen(false)}>
            <div className="report-modal-shell" onClick={(event) => event.stopPropagation()}>
              <div className="report-toolbar report-toolbar--modal">
                <div>
                  <div className="report-title">{analysis.subject}</div>
                  <div className="report-meta">
                    {new Date(analysis.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="action-row">
                  <button type="button" className="secondary-button" onClick={handleCopy}>
                    Copy to clipboard
                  </button>
                  <button type="button" className="primary-button" onClick={handleDownloadPdf}>
                    Download as PDF
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setReportModalOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="report-sheet report-sheet--modal">
                {reportSections.map((section) => (
                  <div
                    key={section.key || section.title}
                    className={`rs-section${section.title === "Safety Disclaimer" ? " rs-section--disclaimer" : ""}`}
                  >
                    <div className="rs-header">
                      {SECTION_ICONS[section.title] && (
                        <span className="rs-icon" aria-hidden="true">
                          {SECTION_ICONS[section.title]}
                        </span>
                      )}
                      <h4 className="rs-title">{section.title}</h4>
                    </div>

                    <div className="rs-body">
                      <ReportContent content={section.content} sectionTitle={section.title} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <GlossaryModal conceptName={modalConcept} onClose={() => setModalConcept(null)} />
      </div>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

const REPORT_STYLES = `
  .report-sheet {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 10px;
    overflow: hidden;
    margin-top: 16px;
    background: var(--color-surface, #fff);
  }
  .report-sheet--modal {
    margin-top: 0;
  }
  .report-preview-note {
    margin-top: 14px;
    color: var(--color-muted, #5f5e5a);
    font-size: 14px;
    line-height: 1.6;
  }
  .report-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.42);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 50;
  }
  .report-modal-shell {
    width: min(980px, 100%);
    max-height: calc(100vh - 48px);
    overflow: auto;
    background: #ffffff;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 14px;
    padding: 20px;
  }
  .report-toolbar--modal {
    position: sticky;
    top: 0;
    background: #ffffff;
    padding-bottom: 16px;
    margin-bottom: 16px;
    z-index: 2;
  }

  .rs-section {
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }
  .rs-section:last-child {
    border-bottom: none;
  }
  .rs-section--disclaimer {
    background: var(--color-warning-bg, #fffbeb);
    border-top: 2px solid var(--color-warning, #f59e0b);
  }

  .rs-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .rs-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--color-accent-soft, #eff6ff);
    color: var(--color-accent, #3b82f6);
    flex-shrink: 0;
  }
  .rs-icon svg {
    width: 16px;
    height: 16px;
  }
  .rs-section--disclaimer .rs-icon {
    background: #fef3c7;
    color: #d97706;
  }
  .rs-title {
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-heading, #1e293b);
    margin: 0;
  }
  .rs-section--disclaimer .rs-title {
    color: #92400e;
  }

  .rs-body {
    padding-left: 38px;
  }

  .rc-paragraph {
    font-size: 0.9rem;
    line-height: 1.75;
    color: var(--color-text, #334155);
    margin: 0 0 10px 0;
  }
  .rc-lead {
    color: var(--color-heading, #1e293b);
    font-weight: 700;
  }
  .rc-paragraph:last-child {
    margin-bottom: 0;
  }
  .rc-subheading {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--color-subheading, #475569);
    margin: 14px 0 6px 0;
  }
  .rc-list {
    margin: 6px 0 10px 0;
    padding-left: 18px;
  }
  .rc-list li {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--color-text, #334155);
    margin-bottom: 4px;
  }
  .rc-list--ordered {
    list-style-type: decimal;
  }
  .rc-kv {
    display: flex;
    gap: 8px;
    font-size: 0.875rem;
    line-height: 1.6;
    margin-bottom: 5px;
  }
  .rc-kv__label {
    font-weight: 600;
    color: var(--color-heading, #1e293b);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .rc-kv__label::after {
    content: ":";
  }
  .rc-kv__value {
    color: var(--color-text, #334155);
  }

  @media print {
    .rs-section {
      break-inside: avoid;
      padding: 14px 18px;
    }
    .rs-section--disclaimer {
      border: 1px solid #f59e0b;
    }
  }
  @media (max-width: 640px) {
    .report-modal-overlay {
      padding: 12px;
    }
    .report-modal-shell {
      padding: 14px;
    }
  }
`;
