import { getPredictionPhrase } from "../components/PredictionBadge";

function formatDate(value) {
  return new Date(value).toLocaleString();
}

export default function Dashboard({ sessions, onStartNew, onViewSession, onDeleteSession }) {
  const totalAnalyses = sessions.length;
  const depressedDetected = sessions.filter((item) => item.prediction === "Depressed").length;
  const healthyDetected = sessions.filter((item) => item.prediction === "Healthy").length;
  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard label="Total Analyses" value={String(totalAnalyses)} />
        <MetricCard label="Depressed Profiles" value={String(depressedDetected)} />
        <MetricCard label="Healthy Profiles" value={String(healthyDetected)} />
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <p className="section-label">Recent activity</p>
            <h3 className="section-title">Recent analyses</h3>
          </div>
          <button type="button" className="primary-button" onClick={onStartNew}>
            Start new analysis
          </button>
        </div>

        {recentSessions.length === 0 ? (
          <div className="empty-state">No analyses have been saved yet.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject name</th>
                  <th>Date</th>
                  <th>Result</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.subject}</td>
                    <td>{formatDate(session.createdAt)}</td>
                    <td>{getPredictionPhrase(session.prediction, session.confidence)}</td>
                    <td className="action-cell">
                      <button type="button" className="secondary-button" onClick={() => onViewSession(session.id)}>
                        View
                      </button>
                      <button type="button" className="ghost-button" onClick={() => onDeleteSession(session.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
