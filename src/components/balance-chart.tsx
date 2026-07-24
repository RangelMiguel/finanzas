"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";

export type ChartPoint = {
  date: string;
  balance: number;
};

export function BalanceChart({
  series,
  goalCents,
  targetDate,
  minDate,
  height = 220,
}: {
  series: ChartPoint[];
  goalCents?: number | null;
  targetDate?: string | null;
  minDate?: string | null;
  height?: number;
}) {
  const { money } = useApp();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!series.length) return null;
    const padX = 12;
    const padY = 16;
    const w = 640;
    const h = height;
    const balances = series.map((s) => s.balance);
    let minB = Math.min(...balances, 0);
    let maxB = Math.max(...balances, goalCents || 0, 0);
    if (minB === maxB) {
      minB -= 10000;
      maxB += 10000;
    }
    const span = maxB - minB || 1;
    const x = (i: number) =>
      padX + (i / Math.max(series.length - 1, 1)) * (w - padX * 2);
    const y = (b: number) =>
      padY + (1 - (b - minB) / span) * (h - padY * 2);

    const line = series
      .map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s.balance).toFixed(1)}`)
      .join(" ");

    const area =
      line +
      ` L ${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

    const zeroY = y(0);
    const goalY = goalCents != null ? y(goalCents) : null;
    const targetIdx =
      targetDate != null
        ? series.findIndex((s) => s.date === targetDate)
        : -1;
    const minIdx =
      minDate != null ? series.findIndex((s) => s.date === minDate) : -1;

    return { w, h, x, y, line, area, zeroY, goalY, targetIdx, minIdx, minB, maxB };
  }, [series, goalCents, targetDate, minDate, height]);

  if (!geo || series.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-[var(--fg-faint)]"
        style={{ height }}
      >
        —
      </div>
    );
  }

  const hi = hover ?? series.length - 1;
  const point = series[hi];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${geo.w} ${geo.h}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="Balance chart"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(45, 212, 191, 0.35)" />
            <stop offset="100%" stopColor="rgba(45, 212, 191, 0)" />
          </linearGradient>
          <linearGradient id="balStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* zero line */}
        <line
          x1={12}
          x2={geo.w - 12}
          y1={geo.zeroY}
          y2={geo.zeroY}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 4"
        />

        {geo.goalY != null && (
          <line
            x1={12}
            x2={geo.w - 12}
            y1={geo.goalY}
            y2={geo.goalY}
            stroke="rgba(251, 191, 36, 0.55)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
          />
        )}

        <path d={geo.area} fill="url(#balFill)" />
        <path
          d={geo.line}
          fill="none"
          stroke="url(#balStroke)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
        />

        {geo.minIdx >= 0 && (
          <circle
            cx={geo.x(geo.minIdx)}
            cy={geo.y(series[geo.minIdx].balance)}
            r={5}
            fill="#fb7185"
            stroke="#1a0a10"
            strokeWidth={2}
          />
        )}

        {geo.targetIdx >= 0 && (
          <line
            x1={geo.x(geo.targetIdx)}
            x2={geo.x(geo.targetIdx)}
            y1={16}
            y2={geo.h - 16}
            stroke="rgba(167, 139, 250, 0.6)"
            strokeDasharray="3 3"
          />
        )}

        {/* hover capture strips */}
        {series.map((_, i) => (
          <rect
            key={i}
            x={geo.x(i) - (geo.w / series.length) / 2}
            y={0}
            width={Math.max(geo.w / series.length, 4)}
            height={geo.h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {point && (
          <circle
            cx={geo.x(hi)}
            cy={geo.y(point.balance)}
            r={6}
            fill="#f0fdfa"
            stroke="#2dd4bf"
            strokeWidth={2}
          />
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg-muted)]">
        <span>{series[0]?.date}</span>
        {point && (
          <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 font-medium text-teal-100">
            {point.date} · {money(point.balance)}
          </span>
        )}
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}
