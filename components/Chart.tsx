import { usdWhole } from "@/lib/money";

type Pt = { label: string; value: number };

/** Area line chart in cents. `step` draws horizontal-then-vertical steps for per-payment balances. */
export function Chart({ points, step, aria }: { points: Pt[]; step?: boolean; aria: string }) {
  const W = 600, H = 190, L = 52, R = 14, T = 12, B = 24;
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  const x = (i: number) => L + (W - L - R) * (n === 1 ? 1 : i / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const coords: string[] = [];
  points.forEach((p, i) => {
    if (step && i > 0) coords.push(`${x(i)},${y(points[i - 1].value)}`);
    coords.push(`${x(i)},${y(p.value)}`);
  });
  const area = `M${L},${y(0)} L${coords.join(" L")} L${x(n - 1)},${y(0)} Z`;
  const every = Math.max(1, Math.ceil(n / 6));
  const last = points[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={aria}>
      {[0, 1, 2, 3].map((g) => {
        const v = (max * g) / 3;
        return (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 6} y={y(v) + 3} textAnchor="end">{usdWhole(v)}</text>
          </g>
        );
      })}
      <path d={area} fill="var(--accent-soft)" />
      <polyline points={coords.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(last.value)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
      {points.map((p, i) =>
        i === n - 1 || (i % every === 0 && n - 1 - i >= every) ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{p.label}</text>
        ) : null,
      )}
    </svg>
  );
}
