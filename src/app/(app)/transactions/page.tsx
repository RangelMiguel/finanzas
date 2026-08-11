"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { monthKey, todayISO, centsToInput, amountToCents } from "@/lib/utils";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { parseSourceKey, sourceKey } from "@/lib/transaction-funding";

type FundingRow = {
  id: string;
  amountCents: number;
  accountId?: string | null;
  creditCardId?: string | null;
  account?: { id: string; name: string } | null;
  creditCard?: { id: string; name: string; lastFour?: string } | null;
};

type Txn = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  type: string;
  categoryId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  spentById?: string | null;
  category?: { name: string; icon: string } | null;
  account?: { name: string } | null;
  creditCard?: { name: string } | null;
  fundings?: FundingRow[];
  createdBy?: { displayName: string } | null;
  spentBy?: { displayName: string } | null;
};
type Cat = { id: string; name: string; type: string; icon: string };
type Acc = { id: string; name: string };
type CardT = { id: string; name: string; lastFour?: string };
type Member = { user: { id: string; displayName: string } };

type PayLine = { source: string; amount: string };

function defaultSource(accounts: Acc[], cards: CardT[]): string {
  if (accounts[0]) return sourceKey("account", accounts[0].id);
  if (cards[0]) return sourceKey("card", cards[0].id);
  return "";
}

function fundingsToPayLines(txn: Txn): PayLine[] {
  if (txn.fundings && txn.fundings.length > 0) {
    return txn.fundings.map((f) => ({
      source: f.creditCardId
        ? sourceKey("card", f.creditCardId)
        : f.accountId
          ? sourceKey("account", f.accountId)
          : "",
      amount: centsToInput(f.amountCents),
    }));
  }
  if (txn.creditCardId) {
    return [
      {
        source: sourceKey("card", txn.creditCardId),
        amount: centsToInput(txn.amountCents),
      },
    ];
  }
  if (txn.accountId) {
    return [
      {
        source: sourceKey("account", txn.accountId),
        amount: centsToInput(txn.amountCents),
      },
    ];
  }
  return [{ source: "", amount: centsToInput(txn.amountCents) }];
}

function fundingLabel(txn: Txn): string {
  if (txn.type === "cc_payment") {
    return [txn.account?.name, txn.creditCard?.name].filter(Boolean).join(" → ");
  }
  if (txn.fundings && txn.fundings.length > 0) {
    return txn.fundings
      .map((f) => {
        if (f.creditCard) return f.creditCard.name;
        if (f.account) return f.account.name;
        return "?";
      })
      .join(" + ");
  }
  if (txn.creditCard) return txn.creditCard.name;
  if (txn.account) return txn.account.name;
  return "";
}

export default function TransactionsPage() {
  const { t, money, members, tr } = useApp();
  const { confirm } = useConfirm();
  const [month, setMonth] = useState(monthKey());
  const [txns, setTxns] = useState<Txn[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [cards, setCards] = useState<CardT[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: todayISO(),
    description: "",
    amount: "",
    type: "expense",
    categoryId: "",
    msiMonths: "",
    spentById: "",
    incomeAccountId: "",
  });
  const [payLines, setPayLines] = useState<PayLine[]>([
    { source: "", amount: "" },
  ]);
  const [spentByFilter, setSpentByFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [amountDebounced, setAmountDebounced] = useState({ min: "", max: "" });

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAmountDebounced({ min: minAmount, max: maxAmount });
    }, 350);
    return () => window.clearTimeout(id);
  }, [minAmount, maxAmount]);

  const filtersActive = Boolean(
    spentByFilter ||
      sourceFilter ||
      amountDebounced.min.trim() ||
      amountDebounced.max.trim()
  );

  async function load() {
    // Load each resource independently so missing accounts/cards modules
    // (or hidden balances) never break the movements list.
    const emptyAcc = { accounts: [] as Acc[] };
    const emptyCc = { creditCards: [] as CardT[] };
    const params = new URLSearchParams({ month });
    if (spentByFilter) params.set("spentById", spentByFilter);
    const source = parseSourceKey(sourceFilter);
    if (source?.kind === "account") params.set("accountId", source.id);
    if (source?.kind === "card") params.set("creditCardId", source.id);
    if (amountDebounced.min.trim()) {
      params.set("minAmount", amountDebounced.min);
    }
    if (amountDebounced.max.trim()) {
      params.set("maxAmount", amountDebounced.max);
    }
    const [txnRes, c, a, cc] = await Promise.all([
      api<{ transactions: Txn[] }>(`/api/transactions?${params.toString()}`),
      api<{ categories: Cat[] }>("/api/categories").catch(() => ({
        categories: [] as Cat[],
      })),
      api<{ accounts: Acc[] }>("/api/accounts").catch(() => emptyAcc),
      api<{ creditCards: CardT[] }>("/api/credit-cards").catch(() => emptyCc),
    ]);
    const accList = a.accounts || [];
    const cardList = cc.creditCards || [];
    setTxns(txnRes.transactions);
    setCategories(c.categories || []);
    setAccounts(accList);
    setCards(cardList);
    setForm((f) => ({
      ...f,
      incomeAccountId: f.incomeAccountId || accList[0]?.id || "",
    }));
    setPayLines((lines) =>
      lines[0]?.source
        ? lines
        : [{ source: defaultSource(accList, cardList), amount: "" }]
    );
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, spentByFilter, sourceFilter, amountDebounced.min, amountDebounced.max]);

  function clearFilters() {
    setSpentByFilter("");
    setSourceFilter("");
    setMinAmount("");
    setMaxAmount("");
    setAmountDebounced({ min: "", max: "" });
  }

  const totalCents = amountToCents(form.amount || 0);
  const paySumCents = useMemo(
    () => payLines.reduce((s, p) => s + amountToCents(p.amount || 0), 0),
    [payLines]
  );

  const singleCardSource =
    form.type === "expense" &&
    payLines.length === 1 &&
    payLines[0]?.source.startsWith("card:");

  function openEdit(txn: Txn) {
    setEditId(txn.id);
    setForm({
      date: txn.date,
      description: txn.description,
      amount: centsToInput(txn.amountCents),
      type: txn.type === "transfer" ? "expense" : txn.type,
      categoryId: txn.categoryId || "",
      msiMonths: "",
      spentById: txn.spentById || "",
      incomeAccountId: txn.accountId || accounts[0]?.id || "",
    });
    setPayLines(
      txn.type === "expense"
        ? fundingsToPayLines(txn)
        : [{ source: defaultSource(accounts, cards), amount: "" }]
    );
    setMode("edit");
  }

  function openNew() {
    setMode("new");
    setEditId(null);
    const src = defaultSource(accounts, cards);
    setForm({
      date: todayISO(),
      description: "",
      amount: "",
      type: "expense",
      categoryId: "",
      msiMonths: "",
      spentById: "",
      incomeAccountId: accounts[0]?.id || "",
    });
    setPayLines([{ source: src, amount: "" }]);
  }

  function setPayLine(i: number, patch: Partial<PayLine>) {
    setPayLines((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  }

  function addPayLine() {
    setPayLines((rows) => [
      ...rows,
      { source: defaultSource(accounts, cards), amount: "" },
    ]);
  }

  function removePayLine(i: number) {
    setPayLines((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
  }

  /** When total changes and only one pay line, keep its amount in sync. */
  function onAmountChange(value: string) {
    setForm((f) => ({ ...f, amount: value }));
    setPayLines((rows) => {
      if (rows.length === 1) return [{ ...rows[0], amount: value }];
      return rows;
    });
  }

  async function save() {
    try {
      if (form.type === "expense") {
        const fundings = payLines.map((p) => ({
          source: p.source,
          amount: p.amount || "0",
        }));
        if (mode === "edit" && editId) {
          await api("/api/transactions", {
            method: "PATCH",
            json: {
              id: editId,
              date: form.date,
              description: form.description,
              amount: form.amount,
              type: "expense",
              categoryId: form.categoryId || null,
              fundings,
              spentById: form.spentById || null,
            },
          });
          toast.success(t.transactions.updated || t.success);
        } else {
          await api("/api/transactions", {
            method: "POST",
            json: {
              date: form.date,
              description: form.description,
              amount: form.amount,
              type: "expense",
              categoryId: form.categoryId || null,
              fundings,
              spentById: form.spentById || null,
              msiMonths: form.msiMonths
                ? parseInt(form.msiMonths, 10)
                : undefined,
              autoCategory: !form.categoryId,
            },
          });
          toast.success(t.transactions.created);
        }
      } else {
        // income: single account
        if (mode === "edit" && editId) {
          await api("/api/transactions", {
            method: "PATCH",
            json: {
              id: editId,
              date: form.date,
              description: form.description,
              amount: form.amount,
              type: "income",
              categoryId: form.categoryId || null,
              accountId: form.incomeAccountId || null,
              creditCardId: null,
              spentById: form.spentById || null,
            },
          });
          toast.success(t.transactions.updated || t.success);
        } else {
          await api("/api/transactions", {
            method: "POST",
            json: {
              date: form.date,
              description: form.description,
              amount: form.amount,
              type: "income",
              categoryId: form.categoryId || null,
              accountId: form.incomeAccountId || null,
              spentById: form.spentById || null,
              autoCategory: !form.categoryId,
            },
          });
          toast.success(t.transactions.created);
        }
      }
      setMode("none");
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.transactions.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/transactions?id=${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const filteredCats = categories.filter((c) => c.type === form.type);
  const memberList: Member[] = members.length > 0 ? members : [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.transactions}
        title={t.transactions.title}
        subtitle={t.transactions.subtitle}
        actions={
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
              aria-label={t.period}
            />
            <Button onClick={openNew}>{t.transactions.new}</Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{t.transactions.filterSpentBy}</Label>
            <Select
              className="mt-1"
              value={spentByFilter}
              onChange={(e) => setSpentByFilter(e.target.value)}
            >
              <option value="">{t.transactions.filterAll}</option>
              <option value="unassigned">{t.transactions.filterUnassigned}</option>
              {memberList.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.transactions.filterSource}</Label>
            <Select
              className="mt-1"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">{t.transactions.filterAll}</option>
              {accounts.length > 0 && (
                <optgroup label={t.transactions.sourceAccounts}>
                  {accounts.map((a) => (
                    <option key={a.id} value={sourceKey("account", a.id)}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {cards.length > 0 && (
                <optgroup label={t.transactions.sourceCards}>
                  {cards.map((c) => (
                    <option key={c.id} value={sourceKey("card", c.id)}>
                      {c.lastFour ? `${c.name} · ${c.lastFour}` : c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
          <div>
            <Label>{t.transactions.filterMin}</Label>
            <Input
              money
              className="mt-1"
              placeholder={t.transactions.filterMinHint}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>{t.transactions.filterMax}</Label>
            <Input
              money
              className="mt-1"
              placeholder={t.transactions.filterMaxHint}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
          {filtersActive && (
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                {t.transactions.filterClear}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {mode === "edit" ? t.edit : t.transactions.newTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.type}</Label>
              <Select
                className="mt-1"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value, categoryId: "" })
                }
              >
                <option value="expense">{t.expense}</option>
                <option value="income">{t.income}</option>
              </Select>
            </div>
            <div>
              <Label>{t.date}</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                money
                className="mt-1"
                value={form.amount}
                onChange={(e) => onAmountChange(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
              >
                <option value="">{t.transactions.autoCategory}</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>

            {form.type === "income" ? (
              <div className="sm:col-span-2">
                <Label>{t.transactions.paidWithIncome}</Label>
                <Select
                  className="mt-1"
                  value={form.incomeAccountId}
                  onChange={(e) =>
                    setForm({ ...form, incomeAccountId: e.target.value })
                  }
                >
                  <option value="">{t.none}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t.transactions.paidWith}</Label>
                  <Button type="button" variant="secondary" size="sm" onClick={addPayLine}>
                    {t.transactions.addPayment}
                  </Button>
                </div>
                <p className="text-xs text-[var(--fg-faint)]">
                  {t.transactions.paymentSplitHint}
                </p>
                {payLines.map((line, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_8rem_auto]"
                  >
                    <div>
                      <Label className="text-xs">{t.transactions.paymentSource}</Label>
                      <Select
                        className="mt-1"
                        value={line.source}
                        onChange={(e) => setPayLine(i, { source: e.target.value })}
                      >
                        <option value="">{t.select}</option>
                        {accounts.length > 0 && (
                          <optgroup label={t.transactions.sourceAccounts}>
                            {accounts.map((a) => (
                              <option key={a.id} value={sourceKey("account", a.id)}>
                                {a.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {cards.length > 0 && (
                          <optgroup label={t.transactions.sourceCards}>
                            {cards.map((c) => (
                              <option key={c.id} value={sourceKey("card", c.id)}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t.transactions.paymentAmount}</Label>
                      <Input
                        money
                        className="mt-1"
                        value={line.amount}
                        onChange={(e) => setPayLine(i, { amount: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={payLines.length <= 1}
                        onClick={() => removePayLine(i)}
                      >
                        {t.transactions.removePayment}
                      </Button>
                    </div>
                  </div>
                ))}
                {totalCents > 0 && (
                  <p
                    className={
                      paySumCents === totalCents
                        ? "text-xs text-[var(--fg-faint)]"
                        : "text-xs text-amber-400"
                    }
                  >
                    {tr(t.transactions.paymentSum, {
                      sum: money(paySumCents),
                      total: money(totalCents),
                    })}
                  </p>
                )}
              </div>
            )}

            {form.type === "expense" && (
              <>
                <div>
                  <Label>{t.transactions.spentBy}</Label>
                  <Select
                    className="mt-1"
                    value={form.spentById}
                    onChange={(e) =>
                      setForm({ ...form, spentById: e.target.value })
                    }
                  >
                    <option value="">{t.none}</option>
                    {memberList.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
                {mode === "new" && singleCardSource && (
                  <div>
                    <Label>{t.transactions.msi}</Label>
                    <Input
                      numeric
                      className="mt-1"
                      value={form.msiMonths}
                      onChange={(e) =>
                        setForm({ ...form, msiMonths: e.target.value })
                      }
                    />
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="divide-y divide-white/5 p-0">
          {txns.length === 0 && (
            <p className="p-5 text-sm text-[var(--fg-faint)]">
              {filtersActive
                ? t.transactions.emptyFiltered
                : t.transactions.empty}
            </p>
          )}
          {txns.map((txn) => {
            const paid = fundingLabel(txn);
            return (
              <div
                key={txn.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {txn.category?.icon || "•"} {txn.description}
                    {txn.category?.name ? (
                      <span className="ml-1 font-normal text-[var(--fg-faint)]">
                        · {txn.category.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--fg-faint)]">
                    {txn.date}
                    {txn.type === "transfer" ? ` · ${t.transfer}` : ""}
                    {txn.type === "cc_payment"
                      ? ` · ${t.cards.ccPaymentType}`
                      : ""}
                    {paid ? ` · ${paid}` : ""}
                    {txn.spentBy ? ` · ${txn.spentBy.displayName}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      txn.type === "income"
                        ? "money-income"
                        : txn.type === "transfer"
                          ? "text-[var(--fg-muted)]"
                          : txn.type === "cc_payment"
                            ? "text-amber-200"
                            : "money-expense"
                    }
                  >
                    {money(txn.amountCents)}
                  </span>
                  {txn.type !== "transfer" && txn.type !== "cc_payment" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEdit(txn)}
                    >
                      {t.edit}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(txn.id)}
                  >
                    {t.delete}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
