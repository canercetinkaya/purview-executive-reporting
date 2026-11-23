'use client';

export interface ChartSeries {
  label: string;
  color: string;
  values: Array<number | null>;
}

export function TrendLineChart({
  title,
  subtitle,
  labels,
  series,
  height = 220,
}: {
  title: string;
  subtitle?: string;
  labels: string[];
  series: ChartSeries[];
  height?: number;
}) {
  const width = 680;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const allNums = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const maxVal = allNums.length > 0 ? Math.max(...allNums) : 100;
  const minVal = 0;
  const range = Math.max(1, maxVal - minVal);
  const count = Math.max(1, labels.length);

  const getX = (i: number) =>
    count === 1 ? padLeft + innerW / 2 : padLeft + (i / (count - 1)) * innerW;
  const getY = (val: number) => padTop + innerH - ((val - minVal) / range) * innerH;

  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[460px]"
          role="img"
          aria-label={title}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const val = Math.round(minVal + tick * range);
            const y = getY(val);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="currentColor"
                  opacity={0.55}
                >
                  {val}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const pts = s.values
              .map((v, i) => (v === null ? null : `${getX(i)},${getY(v)}`))
              .filter((p): p is string => p !== null);

            if (pts.length === 0) return null;
            return (
              <g key={s.label}>
                <polyline
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pts.join(' ')}
                />
                {s.values.map((v, i) =>
                  v === null ? null : (
                    <circle key={`${s.label}-${i}`} cx={getX(i)} cy={getY(v)} r={3.2} fill={s.color}>
                      <title>{`${labels[i]} — ${s.label}: ${v}`}</title>
                    </circle>
                  ),
                )}
              </g>
            );
          })}

          {labels.map((lbl, i) => {
            if (labels.length > 8 && i % 2 !== 0 && i !== labels.length - 1) return null;
            return (
              <text
                key={`${lbl}-${i}`}
                x={getX(i)}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity={0.65}
              >
                {lbl.slice(0, 7)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function HorizontalDistributionList({
  title,
  items,
  barColor = '#0F6CBD',
}: {
  title: string;
  items: Array<{ name: string; count: number | null }>;
  barColor?: string;
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.count ?? 0));
  return (
    <div className="surface-card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No records in selected period.
          </p>
        ) : (
          items.map((item) => {
            const val = item.count ?? 0;
            const pct = Math.round((val / maxVal) * 100);
            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {item.count === null ? 'Unavailable' : val.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.count === null ? 0 : pct}%`, backgroundColor: barColor }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
