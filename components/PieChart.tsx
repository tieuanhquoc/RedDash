'use client';

import React, { useState } from 'react';

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  title: string;
  rows: [string, number][];      // [label, value] sorted desc
  topN?: number;                  // group rest as "Khác"
  size?: number;                  // svg width/height
}

// Notion-style soft palette for pie slices (light theme).
const PALETTE = [
  '#2383E2', '#0F7B6C', '#5A67D8', '#D9730D', '#E03E3E',
  '#9065B0', '#C14C8A', '#447D7D', '#7B8A6C', '#A09F9C',
  '#6B6B68',
];

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const startPt = polarToCartesian(cx, cy, r, start);
  const endPt = polarToCartesian(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${large} 1 ${endPt.x} ${endPt.y} Z`;
}

function fmt(v: number): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
}

export default function PieChart({ title, rows, topN = 8, size = 220 }: PieChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = rows.reduce((s, [, v]) => s + v, 0);
  if (total === 0) {
    return (
      <div className="statCard">
        <div className="statCardTitle">{title}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Không có dữ liệu</p>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const restSum = rest.reduce((s, [, v]) => s + v, 0);

  const slices: Slice[] = top.map(([label, value], i) => ({
    label,
    value,
    color: PALETTE[i % PALETTE.length],
  }));
  if (rest.length > 0) {
    slices.push({
      label: `Khác (${rest.length})`,
      value: restSum,
      color: PALETTE[PALETTE.length - 1],
    });
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  let acc = -Math.PI / 2; // start at top
  const arcs = slices.map((s, i) => {
    const angle = (s.value / total) * Math.PI * 2;
    const start = acc;
    const end = acc + angle;
    acc = end;
    return { ...s, start, end, index: i };
  });

  return (
    <div className="statCard">
      <div className="statCardTitle">{title}</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {arcs.map((a) => {
            const isHover = hovered === a.index;
            return (
              <path
                key={a.index}
                d={arcPath(cx, cy, r, a.start, a.end)}
                fill={a.color}
                stroke="var(--bg, #FFFFFF)"
                strokeWidth={1.5}
                style={{
                  cursor: 'pointer',
                  opacity: hovered !== null && !isHover ? 0.4 : 1,
                  transform: isHover ? 'scale(1.03)' : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: 'opacity .15s, transform .15s',
                }}
                onMouseEnter={() => setHovered(a.index)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${a.label}: ${fmt(a.value)}h (${((a.value / total) * 100).toFixed(1)}%)`}</title>
              </path>
            );
          })}
          {/* donut hole + total label */}
          <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--card, #FFFFFF)" />
          <text
            x={cx} y={cy - 4}
            textAnchor="middle"
            style={{ fontSize: 11, fill: 'var(--text-muted, #6B6B68)' }}
          >
            Tổng
          </text>
          <text
            x={cx} y={cy + 14}
            textAnchor="middle"
            style={{ fontSize: 18, fontWeight: 600, fill: 'var(--text, #37352F)' }}
          >
            {fmt(total)}h
          </text>
        </svg>

        <div style={{ flex: 1, minWidth: 180, fontSize: '.8rem' }}>
          {slices.map((s, i) => {
            const pct = ((s.value / total) * 100).toFixed(1);
            const isHover = hovered === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: isHover ? 'var(--hover, rgba(55,53,47,.06))' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 10, height: 10,
                  background: s.color,
                  borderRadius: 2,
                  flexShrink: 0,
                }} />
                <span style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }} title={s.label}>
                  {s.label}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(s.value)}h · {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
