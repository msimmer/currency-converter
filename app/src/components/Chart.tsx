// Single-series line chart with touch scrubbing, drawn as SVG.

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HistoryPoint } from '../lib/rates';

const PAD = { top: 28, right: 56, bottom: 26, left: 4 };

function niceTicks(min: number, max: number, count = 4): { ticks: number[]; step: number } {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return { ticks, step };
}

function layout(points: HistoryPoint[], W: number, H: number) {
  if (points.length < 2 || W === 0) return null;

  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const padY = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
  lo -= padY;
  hi += padY;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
  const bottom = PAD.top + plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');

  return {
    x,
    y,
    plotW,
    bottom,
    line,
    area: `${line}L${x(points.length - 1)},${bottom}L${x(0)},${bottom}Z`,
    ...niceTicks(lo, hi),
    // X labels: start, middle, end
    xLabels: [0, Math.floor((points.length - 1) / 2), points.length - 1],
  };
}

interface Props {
  points: HistoryPoint[];
  scrub: number | null; // index of the point being read, while scrubbing
  onScrub: (index: number | null) => void;
  formatTick: (n: number, step: number) => string;
  formatDate: (iso: string) => string;
  formatAxisDate: (iso: string) => string;
  label: string;
}

export function Chart({ points, scrub, onScrub, formatTick, formatDate, formatAxisDate, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipTextRef = useRef<SVGTextElement>(null);
  const active = useRef(false);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [tipWidth, setTipWidth] = useState(0);
  const gradientId = `grad-${useId().replace(/[^\w-]/g, '')}`;

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      setSize((s) => (s.W === el.clientWidth && s.H === el.clientHeight ? s : { W: el.clientWidth, H: el.clientHeight }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { W, H } = size;
  const geom = useMemo(() => layout(points, W, H), [points, W, H]);
  const scrubbed = scrub !== null ? points[scrub] : undefined;

  // The tooltip is sized to its text, so measure it once it's drawn.
  useLayoutEffect(() => {
    if (scrubbed && tipTextRef.current) setTipWidth(tipTextRef.current.getComputedTextLength() + 16);
  }, [scrubbed]);

  function indexAt(clientX: number) {
    const r = svgRef.current!.getBoundingClientRect();
    const px = clientX - r.left - PAD.left;
    const i = Math.round((px / geom!.plotW) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, i));
  }

  const end = () => {
    active.current = false;
    onScrub(null);
  };

  let cross = null;
  if (geom && scrub !== null && scrubbed) {
    const cx = geom.x(scrub);
    const tx = Math.max(tipWidth / 2, Math.min(W - tipWidth / 2, cx));
    cross = (
      <g className="cross">
        <line x1={cx} x2={cx} y1={PAD.top - 6} y2={geom.bottom} />
        <circle r={5} cx={cx} cy={geom.y(scrubbed.value)} />
        <g className="tip">
          <rect rx={6} height={22} y={2} x={tx - tipWidth / 2} width={tipWidth} />
          <text ref={tipTextRef} y={17} x={tx} textAnchor="middle">{formatDate(scrubbed.date)}</text>
        </g>
      </g>
    );
  }

  return (
    <div className="chart" id="chart" role="img" aria-label={label} ref={ref}>
      <svg
        className="chart-svg"
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        onPointerDown={(e) => {
          if (!geom) return;
          active.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onScrub(indexAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!geom) return;
          // Mouse hover scrubs too; touch only while pressed.
          if (active.current || e.pointerType === 'mouse') onScrub(indexAt(e.clientX));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') end(); }}
      >
        {geom && (
          <>
            <g className="grid">
              {geom.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={PAD.left + geom.plotW} y1={geom.y(t)} y2={geom.y(t)} />
                  <text x={W - 4} y={geom.y(t) + 4} textAnchor="end" className="axis-label">{formatTick(t, geom.step)}</text>
                </g>
              ))}
            </g>
            {geom.xLabels.map((i, n) => (
              <text key={n} x={geom.x(i)} y={H - 6} textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'} className="axis-label">
                {formatAxisDate(points[i].date)}
              </text>
            ))}
            {/* Opening-value reference line */}
            <line className="ref-line" x1={PAD.left} x2={PAD.left + geom.plotW} y1={geom.y(points[0].value)} y2={geom.y(points[0].value)} />
            <defs>
              <linearGradient id={gradientId} x1={0} y1={0} x2={0} y2={1}>
                <stop offset="0%" className="area-stop-top" />
                <stop offset="100%" className="area-stop-bottom" />
              </linearGradient>
            </defs>
            <path d={geom.area} fill={`url(#${gradientId})`} />
            <path d={geom.line} className="line" />
            {cross}
            <rect className="hit" x={0} y={0} width={W} height={H} fill="transparent" />
          </>
        )}
      </svg>
    </div>
  );
}
