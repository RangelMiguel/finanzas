"use client";

import { Button } from "@/components/ui/button";
import type { MemberVisibility } from "@/lib/visibility";
import { filterAccountId } from "@/lib/visibility";
import { Eye, EyeOff, X } from "lucide-react";

type Catalogs = {
  accounts: { id: string; name: string; icon: string }[];
  categories: { id: string; name: string; icon: string; type: string }[];
  creditCards: { id: string; name: string; lastFour: string }[];
  debts: { id: string; name: string }[];
};

type Labels = {
  title: string;
  subtitle: string;
  adminNote: string;
  modules: string;
  modulesNone: string;
  txn: string;
  accounts: string;
  cards: string;
  debts: string;
  flags: string;
  balancesOn: string;
  balancesOff: string;
  onlyOwn: string;
  allTxn: string;
  namesOn: string;
  namesOff: string;
  showIncome: string;
  showExpense: string;
  showTransfers: string;
  dashIncome: string;
  dashExpense: string;
  dashBalance: string;
  close: string;
  visible: string;
  hidden: string;
};

export function PolicyPreviewModal({
  open,
  onClose,
  policy,
  role,
  catalogs,
  moduleLabels,
  labels,
  isPrivilegedRole,
}: {
  open: boolean;
  onClose: () => void;
  policy: MemberVisibility;
  role: string;
  catalogs: Catalogs | null;
  moduleLabels: Record<keyof MemberVisibility["modules"], string>;
  labels: Labels;
  isPrivilegedRole: boolean;
}) {
  if (!open) return null;

  const enabledModules = (
    Object.keys(policy.modules) as (keyof MemberVisibility["modules"])[]
  ).filter((k) => policy.modules[k]);

  const visibleAccounts =
    catalogs?.accounts.filter((a) => {
      if (!policy.modules.accounts) return false;
      return filterAccountId(policy, a.id);
    }) || [];

  const visibleCards =
    catalogs?.creditCards.filter((c) => {
      if (!policy.modules.creditCards) return false;
      return !policy.hiddenCreditCardIds.includes(c.id);
    }) || [];

  const visibleDebts =
    catalogs?.debts.filter((d) => {
      if (!policy.modules.debts) return false;
      return !policy.hiddenDebtIds.includes(d.id);
    }) || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={labels.close}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-preview-title"
        className="relative z-[1] flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2
              id="policy-preview-title"
              className="font-display text-lg text-[var(--fg)]"
            >
              {labels.title}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              {labels.subtitle}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={labels.close}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {isPrivilegedRole && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {labels.adminNote}
            </p>
          )}

          {/* Fake mini app chrome */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-deep)]">
            <div className="border-b border-white/10 bg-[var(--bg-topbar)] px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">
              {labels.modules}
            </div>
            <div className="flex min-h-[140px]">
              <aside className="w-[42%] space-y-0.5 border-r border-white/10 p-2 sm:w-40">
                {enabledModules.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-[var(--fg-faint)]">
                    {labels.modulesNone}
                  </p>
                ) : (
                  enabledModules.map((k) => (
                    <div
                      key={k}
                      className="rounded-lg bg-[var(--nav-active-1)] px-2 py-1.5 text-xs text-[var(--fg)]"
                    >
                      {moduleLabels[k]}
                    </div>
                  ))
                )}
              </aside>
              <div className="flex-1 space-y-2 p-3">
                <div className="grid grid-cols-3 gap-1.5">
                  <MiniStat
                    label={labels.dashIncome}
                    on={policy.showDashboardIncome && policy.modules.dashboard}
                  />
                  <MiniStat
                    label={labels.dashExpense}
                    on={policy.showDashboardExpense && policy.modules.dashboard}
                  />
                  <MiniStat
                    label={labels.dashBalance}
                    on={policy.showDashboardBalance && policy.modules.dashboard}
                  />
                </div>
                <div className="rounded-lg border border-dashed border-white/10 p-2 text-[11px] text-[var(--fg-faint)]">
                  {labels.txn}:{" "}
                  {[
                    policy.showIncome ? labels.showIncome : null,
                    policy.showExpense ? labels.showExpense : null,
                    policy.showTransfers ? labels.showTransfers : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
            </div>
          </div>

          <Section title={labels.flags}>
            <Flag
              on={policy.showAccountBalances}
              yes={labels.balancesOn}
              no={labels.balancesOff}
            />
            <Flag
              on={!policy.onlyOwnTransactions}
              yes={labels.allTxn}
              no={labels.onlyOwn}
            />
            <Flag
              on={policy.showOtherMembers}
              yes={labels.namesOn}
              no={labels.namesOff}
            />
          </Section>

          <Section title={labels.accounts}>
            {!policy.modules.accounts ? (
              <p className="text-xs text-[var(--fg-faint)]">{labels.hidden}</p>
            ) : visibleAccounts.length === 0 ? (
              <p className="text-xs text-[var(--fg-faint)]">—</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {visibleAccounts.map((a) => (
                  <Chip key={a.id}>
                    {a.icon} {a.name}
                    {!policy.showAccountBalances ? " · •••" : ""}
                  </Chip>
                ))}
              </ul>
            )}
          </Section>

          <Section title={labels.cards}>
            {!policy.modules.creditCards ? (
              <p className="text-xs text-[var(--fg-faint)]">{labels.hidden}</p>
            ) : visibleCards.length === 0 ? (
              <p className="text-xs text-[var(--fg-faint)]">—</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {visibleCards.map((c) => (
                  <Chip key={c.id}>
                    {c.name}
                    {c.lastFour ? ` •••• ${c.lastFour}` : ""}
                  </Chip>
                ))}
              </ul>
            )}
          </Section>

          <Section title={labels.debts}>
            {!policy.modules.debts ? (
              <p className="text-xs text-[var(--fg-faint)]">{labels.hidden}</p>
            ) : visibleDebts.length === 0 ? (
              <p className="text-xs text-[var(--fg-faint)]">—</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {visibleDebts.map((d) => (
                  <Chip key={d.id}>{d.name}</Chip>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {labels.close}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-faint)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-[var(--fg)]">
      {children}
    </li>
  );
}

function Flag({
  on,
  yes,
  no,
}: {
  on: boolean;
  yes: string;
  no: string;
}) {
  return (
    <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
      {on ? (
        <Eye className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <EyeOff className="h-3.5 w-3.5 text-[var(--fg-faint)]" />
      )}
      {on ? yes : no}
    </p>
  );
}

function MiniStat({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`rounded-lg border px-1.5 py-2 text-center ${
        on
          ? "border-white/10 bg-white/5 text-[var(--fg)]"
          : "border-white/5 bg-transparent text-[var(--fg-faint)] opacity-40"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 font-display text-sm">{on ? "•••" : "—"}</div>
    </div>
  );
}
