import { useEffect, useId, useRef, useState } from "react";
import { Card, Button } from "./ui";
import { movementAxis, summarizeActivity } from "../data/dashboard";
import "./stock-movements.css";

const series = [
  { key: "incoming", label: "Received", color: "var(--chart-in)" },
  { key: "outgoing", label: "Removed", color: "var(--chart-out)" },
];
const dateLabel = (date, full = false) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", full
  ? { weekday: "long", month: "long", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
const signed = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString()}`;

export default function StockActivityChart({ activity, days, onPeriodChange }) {
  const [selection, setSelection] = useState(null);
  const [availableWidth, setAvailableWidth] = useState(560);
  const plot = useRef(null);
  const tooltipId = useId();
  const ready = !activity.loading && !activity.error;
  // New results cannot inherit a previous period/account's selected day.
  const selected = ready && selection?.rows === activity.rows
    ? activity.rows.find(row => row.date === selection.date) : null;
  const select = (date, mode) => setSelection({ date, mode, rows: activity.rows });
  const totals = summarizeActivity(activity.rows);
  const axis = movementAxis(activity.rows);
  const hasBars = totals.received > 0 || totals.removed > 0;
  const width = Math.max(days === 30 ? 1080 : 240, availableWidth);
  const left = Math.max(40, String(axis.maximum).length * 8 + 12);
  const step = (width - 12) / days;
  const barWidth = Math.min(24, (step - 8) / 2);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "browser local time";
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const update = () => {
      setAvailableWidth(element.clientWidth);
      // Start with recent dates visible; every earlier day remains reachable.
      if (days === 30) element.scrollLeft = element.scrollWidth - element.clientWidth;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, hasBars, days, activity.rows]);
  return (
    <Card className="dashboard-activity-chart stock-movements" onKeyDown={event => { if (event.key === "Escape") setSelection(null); }}>
      <div className="card-heading">
        <div><h2>Stock movements</h2><p>Daily units · {timezone}</p></div>
        <label className="activity-period">Period
          <select value={days} onChange={event => { setSelection(null); onPeriodChange(Number(event.target.value)); }}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>
      {activity.loading ? <div className="movement-state" role="status">Loading stock movements...</div>
        : activity.error ? <div className="movement-state"><p role="alert">{activity.error}</p><Button onClick={activity.retry}>Retry movements</Button></div>
        : <>
          <dl className="movement-totals" aria-label="Movement totals for the selected period">
            {series.map(({ key, label, color }, index) => <div key={key}>
              <dt><i style={{ background: color }} aria-hidden="true" />{label}</dt>
              <dd>{(index === 0 ? totals.received : totals.removed).toLocaleString()} <span>units</span></dd>
            </div>)}
          </dl>
          <p className="movement-scope">Selected period, including today · movement totals, not current stock</p>
          {hasBars && days === 30 && <p className="movement-scroll-hint">30 daily groups · scroll to see earlier dates</p>}
          <div className="movement-stage">
            {!activity.count ? <div className="movement-state"><h3>No stock movements in this period</h3><p>Receive or remove stock from Products, or choose another period.</p></div>
              : !hasBars ? <div className="movement-state"><h3>Only adjustments in this period</h3><p>Counted inventory was reconciled without receipts or removals. See the adjustment totals below.</p></div>
              : <><svg className="movement-axis" width={left} height="190" aria-hidden="true">
                  {axis.ticks.map(tick => <text key={tick} x={left - 8} y={186 - tick / axis.maximum * 164} textAnchor="end" fill="var(--text-secondary)" fontSize="11">{tick.toLocaleString()}</text>)}
                </svg><div ref={plot} style={{ marginLeft: left }} className="movement-plot-scroll" role="region" aria-label="Received and removed units by day. Scroll for all dates." tabIndex={0}
                onMouseLeave={() => { if (selection?.mode === "hover") setSelection(null); }}>
                <svg width={width} height="222" role="group" aria-label="Received and removed daily units, starting at zero">
                  {axis.ticks.map(tick => {
                    const y = 182 - tick / axis.maximum * 164;
                    return <g key={tick} aria-hidden="true"><line x1="0" x2={width - 12} y1={y} y2={y} stroke={tick === 0 ? "var(--control-border)" : "var(--border)"} /></g>;
                  })}
                  {activity.rows.map((row, index) => {
                    const x = index * step;
                    const label = `${dateLabel(row.date, true)}. Received: ${row.incoming} units. Removed: ${row.outgoing} units. Net adjustment: ${signed(row.adjustment)} units.`;
                    return <g key={row.date} tabIndex={0} role="button" aria-label={label} aria-describedby={selected?.date === row.date ? tooltipId : undefined}
                      onFocus={() => select(row.date, "focus")} onBlur={() => { if (selection?.mode === "focus") setSelection(null); }}
                      onMouseEnter={() => select(row.date, "hover")} onClick={() => select(row.date, "tap")}
                      onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(row.date, "focus"); } }}>
                      <rect className="movement-hit" x={x + 1} y="8" width={step - 2} height="180" rx="3" fill={selected?.date === row.date ? "var(--surface-selected)" : "transparent"} />
                      {series.map(({ key, color }, position) => {
                        const height = row[key] / axis.maximum * 164;
                        return <rect key={key} x={x + (step - barWidth * 2 - 4) / 2 + position * (barWidth + 4)} y={182 - height} width={barWidth} height={height} rx="2" fill={color} />;
                      })}
                      {(days === 7 || index % 5 === 0 || index === days - 1) && <text x={x + step / 2} y="208" textAnchor="middle" fontSize="11" fill="var(--text-secondary)">{dateLabel(row.date)}</text>}
                    </g>;
                  })}
                </svg>
              </div></>}
            {selected && <div className="movement-tooltip" id={tooltipId} role="tooltip" aria-live="polite">
              <strong>{dateLabel(selected.date, true)}</strong>
              <span>Received: {selected.incoming.toLocaleString()} units</span>
              <span>Removed: {selected.outgoing.toLocaleString()} units</span>
              <span>Net adjustment: {signed(selected.adjustment)} units</span>
            </div>}
          </div>
          <div className="movement-adjustments">Adjustments: <strong>+{totals.adjustmentPositive.toLocaleString()} / −{totals.adjustmentNegative.toLocaleString()} units</strong></div>
          <details className="movement-help"><summary>How movements are counted</summary><p>Received and Removed are units moved during this period, including initial stock and archived products. Adjustments reconcile counted inventory and are separate from receipts and removals. They do not describe historical stock balances.</p></details>
          <details className="movement-values"><summary>View daily values</summary>
            <div className="table-scroll"><table><caption className="visually-hidden">Daily movements in local calendar days</caption><thead><tr><th>Date (local)</th><th>Received units</th><th>Removed units</th><th>Net adjustment units</th></tr></thead><tbody>
              {activity.rows.map(row => <tr key={row.date}><td><button type="button" className="movement-date" onClick={() => select(row.date, "tap")}>{dateLabel(row.date, true)}</button></td><td>{row.incoming.toLocaleString()}</td><td>{row.outgoing.toLocaleString()}</td><td>{signed(row.adjustment)}</td></tr>)}
            </tbody></table></div>
          </details>
        </>}
    </Card>
  );
}
