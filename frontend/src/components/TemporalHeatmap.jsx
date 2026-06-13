import { useCallback, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { COLORS, getConceptMeta } from "../utils/constants";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorForValue(value, max) {
  if (!max) {
    return "rgba(95, 94, 90, 0.12)";
  }
  const intensity = clamp(Math.abs(value) / max, 0.08, 1);
  if (value >= 0) {
    return `rgba(163, 45, 45, ${intensity})`;
  }
  return `rgba(24, 95, 165, ${intensity})`;
}

export default function TemporalHeatmap({ concepts, probabilities }) {
  const [tooltip, setTooltip] = useState(null);

  const chartData = probabilities.map((value, index) => ({
    time: index * 5,
    probability: value,
  }));

  const handleLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <div className="card heatmap-card">
      <div className="section-head">
        <div>
          <p className="section-label">Temporal view</p>
          <h3 className="section-title">Concept heatmap</h3>
        </div>
      </div>

      <div className="heatmap-sparkline">
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={chartData} margin={{ top: 12, right: 8, left: 8, bottom: 8 }}>
            <Line type="monotone" dataKey="probability" stroke={COLORS.primary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="heatmap-wrapper" onMouseLeave={handleLeave}>
        <div
          className="heatmap-grid"
          style={{ gridTemplateColumns: `180px repeat(${Math.max(probabilities.length, 1)}, minmax(18px, 1fr))` }}
        >
          <div className="heatmap-corner">Concept / Time Window</div>
          {probabilities.map((_, index) => (
            <div key={`head-${index}`} className="heatmap-header-cell">
              {index + 1}
            </div>
          ))}

          {concepts.map((concept) => {
            const meta = getConceptMeta(concept.name);
            const rowMax = concept.segmentDd.reduce((max, value) => {
              return Math.max(max, Math.abs(value));
            }, 0);

            return (
              <FragmentRow
                key={concept.name}
                concept={concept}
                meta={meta}
                rowMax={rowMax}
                probabilities={probabilities}
                onHover={setTooltip}
              />
            );
          })}
        </div>

        {tooltip && (
          <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <div>Window {tooltip.segmentIndex + 1}</div>
            <div>{tooltip.timeStart}s - {tooltip.timeEnd}s</div>
            <div>DD {tooltip.ddValue >= 0 ? "+" : ""}{tooltip.ddValue.toFixed(4)}</div>
            <div>Depressed probability {tooltip.probability.toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ concept, meta, rowMax, probabilities, onHover }) {
  return (
    <>
      <div className="heatmap-label-cell">{meta.label}</div>
      {concept.segmentDd.map((value, index) => (
        <button
          key={`${concept.name}-${index}`}
          type="button"
          className="heatmap-cell"
          style={{ background: colorForValue(value, rowMax) }}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onHover({
              x: rect.left + rect.width / 2,
              y: rect.top - 12,
              segmentIndex: index,
              timeStart: index * 5,
              timeEnd: index * 5 + 5,
              ddValue: value,
              probability: probabilities[index] ?? 0,
            });
          }}
        />
      ))}
    </>
  );
}
