"use client";

import { useId, useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";

export type PropertyChartPoint = {
  date: string;
  value: number;
  estimate?: number;
  equity?: number;
};

export function PropertyValueChart({
  series,
  height = 200,
  showEstimate = false,
  showEquity = false,
}: {
  series: PropertyChartPoint[];
  height?: number;
  showEstimate?: boolean;
  showEquity?: boolean;
}) {
  const { money, t } = useApp();
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!series.length) return null;
    const padX = 12;
    const padY = 16;
    const w = 640;
    const h = height;
    const vals = series.flatMap((s) => {
      const n = [s.value];
      if (showEstimate && s.estimate != null) n.push(s.estimate);
      if (showEquity && s.equity != null) n.push(s.equity);
      return n;
    });
    let minB = Math.min(...vals, 0);
    let maxB = Math.max(...vals, 0);
    if (minB === maxB) {
      minB -= 10000;
      maxB += 10000;
    }
    const span = maxB - minB || 1;
    const x = (i: number) =>
      padX + (i / Math.max(series.length - 1, 1)) * (w - padX * 2);
    const y = (b: number) => padY + (1 - (b - minB) / span) * (h - padY * 2);
    const path = (pick: (s: PropertyChartPoint) => number | undefined) =>
      series
        .map((s, i) => {
          const v = pick(s);
          if (v == null) return null;
          return `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
        })
        .filter(Boolean)
        .join(" ");
    const valueLine = path((s) => s.value);
    const estimateLine = showEstimate ? path((s) => s.estimate) : "";
    const equityLine = showEquity ? path((s) => s.equity) : "";
    const area =
      valueLine +
      ` L ${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
    return {
      w,
      h,
      x,
      y,
      valueLine,
      estimateLine,
      equityLine,
      area,
      zeroY: y(0),
    };
  }, [series, height, showEstimate, showEquity]);

  if (!geo || series.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-[var(--fg-faint)]"
        style={{ height }}
      >
        {t.properties.chartNeedDates}
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
        aria-label={t.properties.chartTitle}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(45, 212, 191, 0.32)" />
            <stop offset="100%" stopColor="rgba(45, 212, 191, 0)" />
          </linearGradient>
        </defs>
        <line
          x1={12}
          x2={geo.w - 12}
          y1={geo.zeroY}
          y2={geo.zeroY}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 4"
        />
        <path d={geo.area} fill={`url(#${uid}-fill)`} />
        {showEstimate && geo.estimateLine && (
          <path
            d={geo.estimateLine}
            fill="none"
            stroke="rgba(251, 191, 36, 0.75)"
            strokeWidth={1.6}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}
        <path
          d={geo.valueLine}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showEquity && geo.equityLine && (
          <path
            d={geo.equityLine}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
        {series.map((_, i) => (
          <rect
            key={i}
            x={geo.x(i) - geo.w / series.length / 2}
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
            cy={geo.y(point.value)}
            r={5}
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
            {point.date} · {money(point.value)}
            {showEquity && point.equity != null
              ? ` · ${money(point.equity)}`
              : ""}
          </span>
        )}
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}
