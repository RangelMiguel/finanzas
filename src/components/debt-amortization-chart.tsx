"use client";

import { useId, useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";

export type DebtChartRow = {
  month: number;
  interestCents: number;
  capitalCents: number;
  paymentCents: number;
  balanceCents: number;
};

type Props = {
  /** Full amortization rows (after each payment). */
  schedule: DebtChartRow[];
  /** Balance before the first payment. */
  startingBalanceCents: number;
  height?: number;
  /** Optional second plan for comparison (e.g. simulator). */
  compareSchedule?: DebtChartRow[] | null;
  compareStartingBalanceCents?: number;
  className?: string;
};

/**
 * Two SVG charts: remaining balance over months, and stacked payment split
 * (interest vs principal). Matches app chart style (no chart library).
 */
export function DebtAmortizationCharts({
  schedule,
  startingBalanceCents,
  height = 160,
  compareSchedule,
  compareStartingBalanceCents,
  className,
}: Props) {
  const { money, t } = useApp();
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const balanceSeries = useMemo(() => {
    if (!schedule.length) return [];
    return [
      { month: 0, balance: startingBalanceCents },
      ...schedule.map((r) => ({ month: r.month, balance: r.balanceCents })),
    ];
  }, [schedule, startingBalanceCents]);

  const compareBalanceSeries = useMemo(() => {
    if (!compareSchedule?.length) return null;
    const start =
      compareStartingBalanceCents != null
        ? compareStartingBalanceCents
        : startingBalanceCents;
    return [
      { month: 0, balance: start },
      ...compareSchedule.map((r) => ({
        month: r.month,
        balance: r.balanceCents,
      })),
    ];
  }, [compareSchedule, compareStartingBalanceCents, startingBalanceCents]);

  const balGeo = useMemo(() => {
    if (balanceSeries.length < 2) return null;
    const padX = 28;
    const padY = 14;
    const w = 640;
    const h = height;
    const all = [
      ...balanceSeries.map((p) => p.balance),
      ...(compareBalanceSeries?.map((p) => p.balance) ?? []),
    ];
    let minB = Math.min(...all, 0);
    let maxB = Math.max(...all, 0);
    if (minB === maxB) {
      minB = 0;
      maxB = maxB || 10000;
    }
    const span = maxB - minB || 1;
    const n = Math.max(balanceSeries.length - 1, 1);
    const x = (i: number) => padX + (i / n) * (w - padX * 2);
    const y = (b: number) => padY + (1 - (b - minB) / span) * (h - padY * 2);
    const line = balanceSeries
      .map(
        (s, i) =>
          `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s.balance).toFixed(1)}`
      )
      .join(" ");
    const area =
      line +
      ` L ${x(balanceSeries.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
    let compareLine = "";
    if (compareBalanceSeries && compareBalanceSeries.length >= 2) {
      const cn = Math.max(compareBalanceSeries.length - 1, 1);
      const cx = (i: number) => padX + (i / cn) * (w - padX * 2);
      compareLine = compareBalanceSeries
        .map(
          (s, i) =>
            `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${y(s.balance).toFixed(1)}`
        )
        .join(" ");
    }
    return { w, h, x, y, line, area, compareLine, minB, maxB, padX };
  }, [balanceSeries, compareBalanceSeries, height]);

  const barGeo = useMemo(() => {
    if (!schedule.length) return null;
    const padX = 28;
    const padY = 14;
    const w = 640;
    const h = height;
    // Cap bar count so long loans stay readable (totals still use full schedule).
    const maxBars = 60;
    const rows =
      schedule.length > maxBars ? schedule.slice(0, maxBars) : schedule;
    const maxPay = Math.max(...rows.map((r) => r.paymentCents), 1);
    const n = rows.length;
    const inner = w - padX * 2;
    const gap = n > 36 ? 1 : n > 18 ? 2 : 3;
    let barW = n > 0 ? (inner - gap * Math.max(n - 1, 0)) / n : 8;
    barW = Math.min(26, Math.max(2, barW));
    const totalBars = n * barW + gap * Math.max(n - 1, 0);
    const startX = padX + Math.max(0, (inner - totalBars) / 2);
    const y = (v: number) => padY + (1 - v / maxPay) * (h - padY * 2);
    const zeroY = y(0);
    const bars = rows.map((r, i) => {
      const bx = startX + i * (barW + gap);
      const intH = zeroY - y(r.interestCents);
      const capH = zeroY - y(r.capitalCents);
      // Stack: interest at bottom, capital on top.
      return {
        i,
        x: bx,
        w: barW,
        interest: {
          y: zeroY - intH,
          h: Math.max(intH, r.interestCents > 0 ? 1 : 0),
        },
        capital: {
          y: zeroY - intH - capH,
          h: Math.max(capH, r.capitalCents > 0 ? 1 : 0),
        },
        row: r,
      };
    });
    return {
      w,
      h,
      bars,
      zeroY,
      padX,
      truncated: schedule.length > maxBars,
      shown: rows.length,
      total: schedule.length,
    };
  }, [schedule, height]);

  const totals = useMemo(() => {
    let interest = 0;
    let capital = 0;
    for (const r of schedule) {
      interest += r.interestCents;
      capital += r.capitalCents;
    }
    return { interest, capital, paid: interest + capital };
  }, [schedule]);

  if (!schedule.length || !balGeo) {
    return null;
  }

  const hi = hover != null ? hover : null;
  const hoverRow =
    hi != null && hi >= 0 && hi < schedule.length ? schedule[hi] : null;
  const hoverBalance =
    hi != null && balanceSeries[hi + 1]
      ? balanceSeries[hi + 1].balance
      : hi === 0
        ? startingBalanceCents
        : null;

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Balance remaining */}
      <div>
        <p className="mb-1 text-xs font-medium text-[var(--fg-muted)]">
          {t.debts.chartBalance}
        </p>
        <div className="relative rounded-xl border border-white/10 bg-black/20 p-2">
          <svg
            viewBox={`0 0 ${balGeo.w} ${balGeo.h}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={t.debts.chartBalance}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`debtFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(45, 212, 191, 0.3)" />
                <stop offset="100%" stopColor="rgba(45, 212, 191, 0)" />
              </linearGradient>
              <linearGradient
                id={`debtStroke-${uid}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <line
              x1={balGeo.padX}
              x2={balGeo.w - balGeo.padX}
              y1={balGeo.y(0)}
              y2={balGeo.y(0)}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="4 4"
            />
            <path d={balGeo.area} fill={`url(#debtFill-${uid})`} />
            <path
              d={balGeo.line}
              fill="none"
              stroke={`url(#debtStroke-${uid})`}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {balGeo.compareLine && (
              <path
                d={balGeo.compareLine}
                fill="none"
                stroke="rgba(251, 191, 36, 0.85)"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            )}
            {balanceSeries.map((_, i) => (
              <rect
                key={i}
                x={balGeo.x(i) - balGeo.w / balanceSeries.length / 2}
                y={0}
                width={Math.max(balGeo.w / balanceSeries.length, 6)}
                height={balGeo.h}
                fill="transparent"
                onMouseEnter={() => setHover(Math.max(0, i - 1))}
              />
            ))}
            {hi != null && balanceSeries[hi + 1] && (
              <circle
                cx={balGeo.x(hi + 1)}
                cy={balGeo.y(balanceSeries[hi + 1].balance)}
                r={5}
                fill="#f0fdfa"
                stroke="#2dd4bf"
                strokeWidth={2}
              />
            )}
          </svg>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--fg-faint)]">
            <span>{t.debts.chartStart}</span>
            {hoverRow && hoverBalance != null ? (
              <span className="rounded-full border border-teal-400/25 bg-teal-400/10 px-2 py-0.5 text-teal-100">
                {t.debts.scheduleMonth} {hoverRow.month} · {money(hoverBalance)}
              </span>
            ) : (
              <span>
                {money(startingBalanceCents)} →{" "}
                {money(schedule[schedule.length - 1]?.balanceCents ?? 0)}
              </span>
            )}
            <span>
              {t.debts.scheduleMonth} {schedule[schedule.length - 1]?.month}
            </span>
          </div>
          {compareBalanceSeries && (
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--fg-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-gradient-to-r from-teal-400 to-violet-400" />
                {t.debts.chartCurrentPlan}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded border border-dashed border-amber-300 bg-amber-400/40" />
                {t.debts.chartSimPlan}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment split bars */}
      {barGeo && (
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--fg-muted)]">
            {t.debts.chartSplit}
          </p>
          <div className="relative rounded-xl border border-white/10 bg-black/20 p-2">
            <svg
              viewBox={`0 0 ${barGeo.w} ${barGeo.h}`}
              className="h-auto w-full overflow-visible"
              role="img"
              aria-label={t.debts.chartSplit}
              onMouseLeave={() => setHover(null)}
            >
              {barGeo.bars.map((b) => (
                <g
                  key={b.i}
                  onMouseEnter={() => setHover(b.i)}
                  className="cursor-default"
                >
                  <rect
                    x={b.x}
                    y={b.interest.y}
                    width={b.w}
                    height={b.interest.h}
                    rx={1.5}
                    fill={
                      hi === b.i
                        ? "rgba(251, 191, 36, 0.95)"
                        : "rgba(251, 191, 36, 0.65)"
                    }
                  />
                  <rect
                    x={b.x}
                    y={b.capital.y}
                    width={b.w}
                    height={b.capital.h}
                    rx={1.5}
                    fill={
                      hi === b.i
                        ? "rgba(52, 211, 153, 0.95)"
                        : "rgba(52, 211, 153, 0.65)"
                    }
                  />
                </g>
              ))}
            </svg>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap gap-3 text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-amber-400/80" />
                  {t.debts.interest}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-emerald-400/80" />
                  {t.debts.capital}
                </span>
              </div>
              {hoverRow ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[var(--fg)]">
                  {t.debts.scheduleMonth} {hoverRow.month}:{" "}
                  <span className="text-amber-200">
                    {money(hoverRow.interestCents)}
                  </span>
                  {" + "}
                  <span className="text-emerald-300">
                    {money(hoverRow.capitalCents)}
                  </span>
                  {" = "}
                  {money(hoverRow.paymentCents)}
                </span>
              ) : totals.paid > 0 ? (
                <span className="text-[var(--fg-faint)]">
                  {t.debts.interest}: {money(totals.interest)} ·{" "}
                  {t.debts.capital}: {money(totals.capital)}
                </span>
              ) : null}
            </div>
            {barGeo.truncated && (
              <p className="mt-1 text-[10px] text-[var(--fg-faint)]">
                {t.debts.scheduleMonth} 1–{barGeo.shown} / {barGeo.total}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Totals bar: principal vs interest cost */}
      {totals.paid > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--fg-muted)]">
            {t.debts.chartTotals}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-white/5">
            <div className="flex h-full w-full">
              <div
                className="h-full bg-emerald-400/70"
                style={{
                  width: `${(totals.capital / totals.paid) * 100}%`,
                }}
                title={t.debts.capital}
              />
              <div
                className="h-full bg-amber-400/70"
                style={{
                  width: `${(totals.interest / totals.paid) * 100}%`,
                }}
                title={t.debts.interest}
              />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--fg-muted)]">
            <span>
              {t.debts.capital}{" "}
              <span className="text-emerald-300">{money(totals.capital)}</span>
              {` (${Math.round((totals.capital / totals.paid) * 100)}%)`}
            </span>
            <span>
              {t.debts.interest}{" "}
              <span className="text-amber-200">{money(totals.interest)}</span>
              {` (${Math.round((totals.interest / totals.paid) * 100)}%)`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
