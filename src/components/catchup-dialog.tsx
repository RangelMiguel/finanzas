"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { todayISO } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";

type Account = { id: string; name: string };
type Debt = { id: string; name: string };

export function CatchupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, tr } = useApp();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [rows, setRows] = useState([
    {
      date: todayISO(),
      description: "",
      amount: "",
      type: "expense",
      accountId: "",
    },
  ]);
  const [balances, setBalances] = useState<Record<string, string>>({});
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
    Promise.all([
      api<{ accounts: Account[] }>("/api/accounts"),
      api<{ debts: Debt[] }>("/api/debts"),
    ]).then(([a, d]) => {
      setAccounts(a.accounts);
      setDebts(d.debts);
      if (a.accounts[0]) {
        setRows((r) => r.map((x) => ({ ...x, accountId: a.accounts[0].id })));
        setDebtPay((p) => ({
          ...p,
          accountId: a.accounts[0].id,
          debtId: d.debts[0]?.id || "",
        }));
      }
    });
  }, [open]);

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
        .map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type as "income" | "expense",
          accountId: r.accountId || null,
        }));
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0f1a] p-6 shadow-2xl">
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
                    next[i] = { ...r, type: e.target.value };
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
                  placeholder={t.amount}
                  value={r.amount}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, amount: e.target.value };
                    setRows(next);
                  }}
                />
                <Select
                  value={r.accountId}
                  aria-label={t.account}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, accountId: e.target.value };
                    setRows(next);
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
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
                    accountId: accounts[0]?.id || "",
                  },
                ])
              }
            >
              {t.catchup.addRow}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">{t.catchup.balances}</p>
            <p className="text-xs text-[var(--fg-faint)]">{t.catchup.balancesHint}</p>
            {accounts.map((a) => (
              <div key={a.id}>
                <Label>
                  {a.name} — {t.catchup.realBalance}
                </Label>
                <Input
                  className="mt-1"
                  placeholder={t.optional}
                  value={balances[a.id] || ""}
                  onChange={(e) =>
                    setBalances((b) => ({ ...b, [a.id]: e.target.value }))
                  }
                />
              </div>
            ))}
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
