import { useEffect, useState } from "react";

export default function ProgressStepper({ stages }) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function formatSeconds(stage) {
    if (!stage.startedAt) {
      return "0s";
    }
    const endTime = stage.completedAt || tick;
    const seconds = Math.max(0, Math.round((endTime - stage.startedAt) / 1000));
    return `${seconds}s`;
  }

  function getMarker(stage) {
    if (stage.status === "complete") {
      return "✓";
    }
    if (stage.status === "active") {
      return <span className="stage-spinner" />;
    }
    return stage.index + 1;
  }

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <p className="section-label">Pipeline progress</p>
          <h3 className="section-title">Analysis stages</h3>
        </div>
      </div>
      <div className="stage-list">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={`stage-item stage-${stage.status}`}
          >
            <div className="stage-marker">{getMarker(stage)}</div>
            <div className="stage-body">
              <div className="stage-row">
                <span className="stage-title">{stage.label}</span>
                <span className="stage-time">{formatSeconds(stage)}</span>
              </div>
              <div className="stage-status-text">
                {stage.status === "complete" ? "Completed" : stage.status === "active" ? "In progress" : "Pending"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
