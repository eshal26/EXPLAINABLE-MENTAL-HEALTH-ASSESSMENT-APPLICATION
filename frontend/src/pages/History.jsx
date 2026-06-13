import { useCallback, useState } from "react";
import { getPredictionPhrase } from "../components/PredictionBadge";

function sortSessions(sessions, sortKey, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...sessions].sort((a, b) => {
    let left = a[sortKey];
    let right = b[sortKey];

    if (sortKey === "createdAt") {
      left = new Date(left).getTime();
      right = new Date(right).getTime();
    }

    if (typeof left === "string") {
      return left.localeCompare(right) * factor;
    }
    return (left - right) * factor;
  });
}

export default function History({
  sessions,
  onViewSession,
  onDeleteSession,
  onClearAll,
}) {
  const [sortKey, setSortKey] = useState("createdAt");
  const [direction, setDirection] = useState("desc");
  const [filter, setFilter] = useState("All");

  const toggleSort = useCallback((key) => {
    setSortKey((current) => {
      if (current === key) {
        setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        return current;
      }
      setDirection("asc");
      return key;
    });
  }, []);

  const filtered = sessions.filter((session) => {
    if (filter === "All") {
      return true;
    }
    return session.prediction === filter;
  });
  const sorted = sortSessions(filtered, sortKey, direction);

  return (
    <div className="page-stack">
      <div className="card">
        <div className="section-head">
          <div>
            <p className="section-label">History</p>
            <h3 className="section-title">Saved analyses</h3>
          </div>
          <div className="action-row">
            <select className="select-input" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="All">All</option>
              <option value="Depressed">Depressed</option>
              <option value="Healthy">Healthy</option>
            </select>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                if (window.confirm("Clear all saved history?")) {
                  onClearAll();
                }
              }}
            >
              Clear all history
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state">No saved sessions match this filter.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader label="Subject" onClick={() => toggleSort("subject")} />
                  <SortableHeader label="Date / Time" onClick={() => toggleSort("createdAt")} />
                  <SortableHeader label="Result" onClick={() => toggleSort("confidence")} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((session) => (
                  <tr key={session.id} onClick={() => onViewSession(session.id)} className="clickable-row">
                    <td>{session.subject}</td>
                    <td>{new Date(session.createdAt).toLocaleString()}</td>
                    <td>{getPredictionPhrase(session.prediction, session.confidence)}</td>
                    <td className="action-cell" onClick={(event) => event.stopPropagation()}>
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

function SortableHeader({ label, onClick }) {
  return (
    <th>
      <button type="button" className="table-sort-button" onClick={onClick}>
        {label}
      </button>
    </th>
  );
}
