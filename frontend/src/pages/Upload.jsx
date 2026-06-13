import { useCallback, useRef, useState } from "react";
import ProgressStepper from "../components/ProgressStepper";

function formatSize(file) {
  if (!file) {
    return "";
  }
  return `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Upload({
  onAnalyze,
  runState,
  onRetry,
  onCancel,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [subjectName, setSubjectName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const applyFile = useCallback((nextFile) => {
    if (!nextFile) {
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".edf")) {
      setError("Only .edf files are supported.");
      return;
    }
    setError("");
    setFile(nextFile);
    const basename = nextFile.name.replace(/\.edf$/i, "");
    setSubjectName((current) => current || basename);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!file) {
      setError("Select an EDF file before starting the analysis.");
      return;
    }
    setError("");
    onAnalyze(file, subjectName.trim() || file.name.replace(/\.edf$/i, ""));
  }, [file, onAnalyze, subjectName]);

  const handleRetry = useCallback(() => {
    if (file) {
      handleSubmit();
      return;
    }
    onRetry();
  }, [file, handleSubmit, onRetry]);

  return (
    <div className="page-stack">
      {runState.error && (
        <div className="error-banner">
          <div>
            <strong>Analysis failed</strong>
            <div>{runState.error}</div>
          </div>
          <button type="button" className="ghost-button" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}

      <div className="card">
        <div className="section-head">
          <div>
            <p className="section-label">Upload</p>
            <h3 className="section-title">New EEG analysis</h3>
          </div>
        </div>

        <div
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            applyFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".edf"
            hidden
            onChange={(event) => applyFile(event.target.files[0])}
          />
          <div className="upload-icon">EDF</div>
          <div className="upload-title">Drop your .edf file here or click to browse</div>
          <div className="upload-subtitle">
            {file ? `${file.name} · ${formatSize(file)}` : "Clinical EDF recordings only"}
          </div>
        </div>

        <div className="form-grid">
          <label className="field-group">
            <span className="field-label">Subject name</span>
            <input
              className="text-input"
              value={subjectName}
              onChange={(event) => setSubjectName(event.target.value)}
              placeholder="Optional. Defaults to the filename."
            />
          </label>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={runState.loading}
          >
            {runState.loading ? "Running analysis..." : "Start analysis"}
          </button>
          {runState.loading && (
            <button type="button" className="ghost-button" onClick={onCancel}>
              Cancel analysis
            </button>
          )}
        </div>
      </div>

      {(runState.loading || runState.progress > 0) && (
        <div className="card">
          <div className="progress-shell">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${runState.progress}%` }} />
            </div>
            <div className="muted-text">{runState.progress}% complete</div>
            {runState.currentMessage && (
              <div className="muted-text">{runState.currentMessage}</div>
            )}
          </div>
          <ProgressStepper stages={runState.stages} />
        </div>
      )}
    </div>
  );
}
