"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { pesosToCents, todayISO } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";

type Account = { id: string; name: string; balanceCents: number | null };
type Card = {
  id: string;
  name: string;
  lastFour?: string;
  outstandingCents?: number | null;
};
type Debt = { id: string; name: string };

type CatchupRow = {
  date: string;
  description: string;
  amount: string;
  type: string;
  source: string;
};

function sourceKey(kind: "account" | "card", id: string) {
  return `${kind}:${id}`;
}

function parseSource(value: string): {
  accountId: string | null;
  creditCardId: string | null;
} {
  if (value.startsWith("card:")) {
    return { accountId: null, creditCardId: value.slice(5) };
  }
  if (value.startsWith("account:")) {
    return { accountId: value.slice(8), creditCardId: null };
  }
  return { accountId: value || null, creditCardId: null };
}

function parseCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n)) return null;
  return pesosToCents(n);
}

export function CatchupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, tr, money } = useApp();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [rows, setRows] = useState<CatchupRow[]>([
    {
      date: todayISO(),
      description: "",
      amount: "",
      type: "expense",
      source: "",
    },
  ]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [cardBalances, setCardBalances] = useState<Record<string, string>>({});
  const [debtPay, setDebtPay] = useState({
    debtId: "",
    capital: "",
    interest: "",
    accountId: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBalances({});
    setCardBalances({});
    Promise.all([
      api<{ accounts: Account[] }>("/api/accounts").catch(() => ({
        accounts: [] as Account[],
      })),
      api<{ creditCards: Card[] }>("/api/credit-cards").catch(() => ({
        creditCards: [] as Card[],
      })),
      api<{ debts: Debt[] }>("/api/debts").catch(() => ({
        debts: [] as Debt[],
      })),
    ]).then(([a, c, d]) => {
      setAccounts(a.accounts);
      setCards(c.creditCards);
      setDebts(d.debts);
      const defaultSource = a.accounts[0]
        ? sourceKey("account", a.accounts[0].id)
        : c.creditCards[0]
          ? sourceKey("card", c.creditCards[0].id)
          : "";
      setRows((r) => r.map((x) => ({ ...x, source: defaultSource })));
      setDebtPay((p) => ({
        ...p,
        accountId: a.accounts[0]?.id || "",
        debtId: d.debts[0]?.id || "",
      }));
    });
  }, [open]);

  const defaultSource = accounts[0]
    ? sourceKey("account", accounts[0].id)
    : cards[0]
      ? sourceKey("card", cards[0].id)
      : "";

  const recon = useMemo(() => {
    const accountRows = accounts.map((a) => {
      const real = parseCents(balances[a.id] || "");
      const book = a.balanceCents;
      const diff =
        real == null || book == null ? null : real - book;
      return { id: a.id, name: a.name, book, real, diff };
    });
    const cardRows = cards.map((c) => {
      const real = parseCents(cardBalances[c.id] || "");
      const book =
        typeof c.outstandingCents === "number" ? c.outstandingCents : null;
      const diff =
        real == null || book == null ? null : real - book;
      const label = c.lastFour ? `${c.name} · ${c.lastFour}` : c.name;
      return { id: c.id, name: label, book, real, diff };
    });
    const missingAccountExpenses = accountRows.reduce(
      (s, r) => s + (r.diff != null && r.diff < 0 ? -r.diff : 0),
      0
    );
    const extraAccountCash = accountRows.reduce(
      (s, r) => s + (r.diff != null && r.diff > 0 ? r.diff : 0),
      0
    );
    const missingCardCharges = cardRows.reduce(
      (s, r) => s + (r.diff != null && r.diff > 0 ? r.diff : 0),
      0
    );
    const extraCardDebt = cardRows.reduce(
      (s, r) => s + (r.diff != null && r.diff < 0 ? -r.diff : 0),
      0
    );
    const entered =
      accountRows.some((r) => r.real != null) ||
      cardRows.some((r) => r.real != null);
    return {
      accountRows,
      cardRows,
      missingAccountExpenses,
      extraAccountCash,
      missingCardCharges,
      extraCardDebt,
      missingSpend: missingAccountExpenses + missingCardCharges,
      entered,
    };
  }, [accounts, cards, balances, cardBalances]);

  if (!open) return null;

  async function submit() {
    setLoading(true);
    try {
      const balanceAdjustments = Object.entries(balances)
        .filter(([, v]) => v !== "")
        .map(([accountId, realBalance]) => ({ accountId, realBalance }));
      const debtPayments =
        debtPay.debtId && debtPay.capital
          ? [
              {
                debtId: debtPay.debtId,
                capital: debtPay.capital,
                interest: debtPay.interest || 0,
                accountId: debtPay.accountId || null,
              },
            ]
          : [];
      const transactions = rows
        .filter((r) => r.description && r.amount)
        .map((r) => {
          const src = parseSource(r.source);
          return {
            date: r.date,
            description: r.description,
            amount: r.amount,
            type: r.type as "income" | "expense",
            accountId: src.accountId,
            creditCardId: r.type === "expense" ? src.creditCardId : null,
          };
        });
      const res = await api<{ created: number }>("/api/catchup", {
        method: "POST",
        json: { transactions, balanceAdjustments, debtPayments },
      });
      toast.success(tr(t.catchup.saved, { n: res.created }));
      onClose();
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catchup-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0f1a] p-6 shadow-2xl">
        <h2 id="catchup-title" className="font-display text-2xl">
          {t.catchup.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">{t.catchup.subtitle}</p>
        <p className="mt-2 text-xs text-[var(--accent)]">
          {tr(t.catchup.stepOf, { current: step + 1, total: 3 })}
        </p>

        {step === 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">{t.catchup.expensesIncomes}</p>
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 p-2"
              >
                <Input
                  type="date"
                  value={r.date}
                  aria-label={t.date}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, date: e.target.value };
                    setRows(next);
                  }}
                />
                <Select
                  value={r.type}
                  aria-label={t.type}
                  onChange={(e) => {
                    const next = [...rows];
                    const type = e.target.value;
                    let source = r.source;
                    if (type === "income" && source.startsWith("card:")) {
                      source = accounts[0]
                        ? sourceKey("account", accounts[0].id)
                        : "";
                    }
                    next[i] = { ...r, type, source };
                    setRows(next);
                  }}
                >
                  <option value="expense">{t.expense}</option>
                  <option value="income">{t.income}</option>
                </Select>
                <Input
                  className="col-span-2"
                  placeholder={t.description}
                  value={r.description}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, description: e.target.value };
                    setRows(next);
                  }}
                />
                <Input
                  money
                  placeholder={t.amount}
                  value={r.amount}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, amount: e.target.value };
                    setRows(next);
                  }}
                />
                <Select
                  value={r.source}
                  aria-label={t.catchup.paidWith}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, source: e.target.value };
                    setRows(next);
                  }}
                >
                  {accounts.length > 0 && (
                    <optgroup label={t.catchup.accounts}>
                      {accounts.map((a) => (
                        <option key={a.id} value={sourceKey("account", a.id)}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {r.type === "expense" && cards.length > 0 && (
                    <optgroup label={t.catchup.cards}>
                      {cards.map((c) => (
                        <option key={c.id} value={sourceKey("card", c.id)}>
                          {c.lastFour ? `${c.name} · ${c.lastFour}` : c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  {
                    date: todayISO(),
                    description: "",
                    amount: "",
                    type: "expense",
                    source: defaultSource,
                  },
                ])
              }
            >
              {t.catchup.addRow}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-sm font-medium">{t.catchup.balances}</p>
              <p className="mt-1 text-xs text-[var(--fg-faint)]">
                {t.catchup.balancesHint}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
                {t.catchup.accounts}
              </p>
              {accounts.length === 0 ? (
                <p className="text-sm text-[var(--fg-faint)]">
                  {t.catchup.noAccounts}
                </p>
              ) : (
                accounts.map((a) => (
                  <BalanceCheckRow
                    key={a.id}
                    name={a.name}
                    bookCents={a.balanceCents}
                    value={balances[a.id] || ""}
                    onChange={(v) =>
                      setBalances((b) => ({ ...b, [a.id]: v }))
                    }
                    kind="asset"
                  />
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
                {t.catchup.cards}
              </p>
              {cards.length === 0 ? (
                <p className="text-sm text-[var(--fg-faint)]">
                  {t.catchup.noCards}
                </p>
              ) : (
                cards.map((c) => (
                  <BalanceCheckRow
                    key={c.id}
                    name={
                      c.lastFour ? `${c.name} · ${c.lastFour}` : c.name
                    }
                    bookCents={
                      typeof c.outstandingCents === "number"
                        ? c.outstandingCents
                        : null
                    }
                    value={cardBalances[c.id] || ""}
                    onChange={(v) =>
                      setCardBalances((b) => ({ ...b, [c.id]: v }))
                    }
                    kind="liability"
                  />
                ))
              )}
            </div>

            {recon.entered && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs">
                {recon.missingSpend > 0 ? (
                  <p className="text-amber-200">
                    {tr(t.catchup.missingSpend, {
                      amount: money(recon.missingSpend),
                    })}
                  </p>
                ) : (
                  <p className="text-emerald-300">{t.catchup.balancesMatch}</p>
                )}
                {recon.extraAccountCash > 0 && (
                  <p className="text-[var(--fg-muted)]">
                    {tr(t.catchup.extraCash, {
                      amount: money(recon.extraAccountCash),
                    })}
                  </p>
                )}
                {recon.extraCardDebt > 0 && (
                  <p className="text-[var(--fg-muted)]">
                    {tr(t.catchup.extraCardDebt, {
                      amount: money(recon.extraCardDebt),
                    })}
                  </p>
                )}
                {recon.missingSpend > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setStep(0)}
                  >
                    {t.catchup.addMissing}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">{t.catchup.debtPayments}</p>
            {debts.length === 0 ? (
              <p className="text-sm text-[var(--fg-faint)]">{t.catchup.noDebts}</p>
            ) : (
              <>
                <div>
                  <Label>{t.catchup.debt}</Label>
                  <Select
                    className="mt-1"
                    value={debtPay.debtId}
                    onChange={(e) =>
                      setDebtPay((p) => ({ ...p, debtId: e.target.value }))
                    }
                  >
                    {debts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t.catchup.capital}</Label>
                  <Input
                    money
                    className="mt-1"
                    value={debtPay.capital}
                    onChange={(e) =>
                      setDebtPay((p) => ({ ...p, capital: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>{t.catchup.interest}</Label>
                  <Input
                    money
                    className="mt-1"
                    value={debtPay.interest}
                    onChange={(e) =>
                      setDebtPay((p) => ({ ...p, interest: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                {t.back}
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={() => setStep((s) => s + 1)}>{t.next}</Button>
            ) : (
              <Button onClick={submit} disabled={loading}>
                {loading ? t.catchup.saving : t.catchup.done}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BalanceCheckRow({
  name,
  bookCents,
  value,
  onChange,
  kind,
}: {
  name: string;
  bookCents: number | null;
  value: string;
  onChange: (v: string) => void;
  kind: "asset" | "liability";
}) {
  const { t, tr, money } = useApp();
  const real = parseCents(value);
  const diff =
    real == null || bookCents == null ? null : real - bookCents;

  let hint: string | null = null;
  let tone = "text-[var(--fg-muted)]";
  if (diff === 0) {
    hint = t.catchup.diffOk;
    tone = "text-emerald-300";
  } else if (diff != null && kind === "asset") {
    if (diff < 0) {
      hint = tr(t.catchup.diffMissingExpenses, { amount: money(-diff) });
      tone = "text-amber-200";
    } else {
      hint = tr(t.catchup.diffMissingIncome, { amount: money(diff) });
      tone = "text-sky-200";
    }
  } else if (diff != null && kind === "liability") {
    if (diff > 0) {
      hint = tr(t.catchup.diffMissingCharges, { amount: money(diff) });
      tone = "text-amber-200";
    } else {
      hint = tr(t.catchup.diffExtraCard, { amount: money(-diff) });
      tone = "text-sky-200";
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{name}</Label>
        <span className="text-[11px] text-[var(--fg-faint)]">
          {bookCents == null
            ? t.catchup.bookHidden
            : tr(t.catchup.inApp, { amount: money(bookCents) })}
        </span>
      </div>
      <Input
        money
        className="mt-1.5"
        placeholder={t.catchup.realPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className={`mt-1.5 text-[11px] leading-snug ${tone}`}>{hint}</p>}
    </div>
  );
}
