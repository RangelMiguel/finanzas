import { requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/household";
import { accountBalance } from "@/lib/money";
import { formatMoney, pesosToCents, todayISO } from "@/lib/utils";
import { suggestCategoryName } from "@/lib/categorize";
import {
  legacyFieldsFromFundings,
  type FundingInput,
} from "@/lib/transaction-funding";
import {
  canSeeAccountBalances,
  canSeeModule,
  filterTransaction,
  type MemberVisibility,
} from "@/lib/visibility";
import type { ToolCallRequest, ToolExecResult, ToolSpec } from "./complete";

export type FinanceToolContext = {
  userId: string;
  householdId: string;
  visibility: MemberVisibility;
  subjectUserId: string;
  currency: string;
  locale: string;
};

const fundingInclude = {
  fundings: {
    include: {
      account: { select: { id: true, name: true, icon: true } },
      creditCard: { select: { id: true, name: true, lastFour: true } },
    },
  },
};

export const FINANCE_TOOLS: ToolSpec[] = [
  {
    name: "list_accounts",
    description: "List household bank/cash accounts with current balances and ids.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_categories",
    description: "List income and expense categories with ids. Use before adding a movement if the category is unclear.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["expense", "income"],
          description: "Optional filter",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_credit_cards",
    description: "List household credit cards with ids and last four digits.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_members",
    description: "List household members (for spentBy on an expense).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_transactions",
    description: "Search recent movements by text, type, or month (YYYY-MM).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text in the description" },
        type: { type: "string", enum: ["expense", "income"] },
        month: { type: "string", description: "YYYY-MM" },
        limit: { type: "number", description: "Max rows, default 15, max 40" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_expense",
    description:
      "Create an expense (gasto). Amount is in household currency units, not cents (e.g. 250.50). Resolve account or card by name if the user said one. If neither is specified and there is exactly one account, use that account.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in currency units, e.g. 185.5" },
        description: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        category: { type: "string", description: "Category name or id" },
        account: { type: "string", description: "Account name or id to pay from" },
        creditCard: { type: "string", description: "Credit card name, last four, or id" },
        spentBy: { type: "string", description: "Member name or id; omit for household shared" },
      },
      required: ["amount", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "add_income",
    description:
      "Create an income (ingreso). Amount is in household currency units, not cents. Deposit into an account by name or id.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number" },
        description: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        category: { type: "string", description: "Category name or id" },
        account: { type: "string", description: "Account name or id to receive the money" },
      },
      required: ["amount", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "update_transaction",
    description: "Update an existing movement by id. Only send fields that should change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        amount: { type: "number" },
        description: { type: "string" },
        date: { type: "string" },
        category: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_transaction",
    description: "Soft-delete a movement by id. Only use when the user clearly asked to remove it.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

export async function executeFinanceTool(
  ctx: FinanceToolContext,
  call: ToolCallRequest
): Promise<ToolExecResult> {
  const args = call.arguments ?? {};
  switch (call.name) {
    case "list_accounts":
      return listAccounts(ctx);
    case "list_categories":
      return listCategories(ctx, str(args.type));
    case "list_credit_cards":
      return listCreditCards(ctx);
    case "list_members":
      return listMembers(ctx);
    case "search_transactions":
      return searchTransactions(ctx, {
        query: str(args.query),
        type: str(args.type),
        month: str(args.month),
        limit: num(args.limit),
      });
    case "add_expense":
      return addMovement(ctx, "expense", args);
    case "add_income":
      return addMovement(ctx, "income", args);
    case "update_transaction":
      return updateMovement(ctx, args);
    case "delete_transaction":
      return deleteMovement(ctx, str(args.id));
    default:
      return { ok: false, summary: `Unknown tool ${call.name}`, error: "unknown_tool" };
  }
}

async function listAccounts(ctx: FinanceToolContext): Promise<ToolExecResult> {
  if (!canSeeModule(ctx.visibility, "accounts")) {
    return { ok: false, summary: "No access to accounts", error: "forbidden" };
  }
  const accounts = await prisma.account.findMany({
    where: { householdId: ctx.householdId, ownerUserId: null },
    select: { id: true, name: true, type: true, icon: true, initialBalanceCents: true },
    take: 40,
  });
  const txns = canSeeAccountBalances(ctx.visibility)
    ? await prisma.transaction.findMany({
        where: { householdId: ctx.householdId, deletedAt: null },
        select: {
          type: true,
          amountCents: true,
          accountId: true,
          toAccountId: true,
          date: true,
          deletedAt: true,
          creditCardId: true,
          fundings: { select: { amountCents: true, accountId: true, creditCardId: true } },
        },
      })
    : [];
  const rows = accounts.map((acc) => ({
    id: acc.id,
    name: acc.name,
    type: acc.type,
    icon: acc.icon,
    balance: canSeeAccountBalances(ctx.visibility)
      ? formatMoney(accountBalance(acc.initialBalanceCents, txns, acc.id), ctx.currency, ctx.locale)
      : null,
  }));
  return { ok: true, summary: `${rows.length} accounts`, data: rows };
}

async function listCategories(ctx: FinanceToolContext, type?: string): Promise<ToolExecResult> {
  const where: { householdId: string; type?: string } = { householdId: ctx.householdId };
  if (type === "income" || type === "expense") where.type = type;
  const rows = await prisma.category.findMany({
    where,
    select: { id: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: 80,
  });
  return { ok: true, summary: `${rows.length} categories`, data: rows };
}

async function listCreditCards(ctx: FinanceToolContext): Promise<ToolExecResult> {
  if (!canSeeModule(ctx.visibility, "creditCards")) {
    return { ok: false, summary: "No access to credit cards", error: "forbidden" };
  }
  const rows = await prisma.creditCard.findMany({
    where: { householdId: ctx.householdId },
    select: { id: true, name: true, lastFour: true },
    take: 30,
  });
  return { ok: true, summary: `${rows.length} cards`, data: rows };
}

async function listMembers(ctx: FinanceToolContext): Promise<ToolExecResult> {
  const rows = await prisma.membership.findMany({
    where: { householdId: ctx.householdId },
    include: { user: { select: { id: true, displayName: true } } },
    take: 20,
  });
  return {
    ok: true,
    summary: `${rows.length} members`,
    data: rows.map((row) => ({
      id: row.userId,
      name: row.user.displayName,
      role: row.role,
    })),
  };
}

async function searchTransactions(
  ctx: FinanceToolContext,
  opts: { query?: string; type?: string; month?: string; limit?: number }
): Promise<ToolExecResult> {
  if (!canSeeModule(ctx.visibility, "transactions")) {
    return { ok: false, summary: "No access to transactions", error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 40);
  const where: Record<string, unknown> = {
    householdId: ctx.householdId,
    deletedAt: null,
  };
  if (opts.type === "expense" || opts.type === "income") where.type = opts.type;
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    where.date = { gte: `${opts.month}-01`, lte: `${opts.month}-31` };
  }
  if (opts.query) where.description = { contains: opts.query };
  const raw = await prisma.transaction.findMany({
    where,
    include: { category: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: Math.min(limit * 3, 80),
  });
  const rows = raw
    .filter((txn) => filterTransaction(ctx.visibility, txn, ctx.subjectUserId))
    .slice(0, limit)
    .map((txn) => ({
      id: txn.id,
      date: txn.date,
      type: txn.type,
      amount: formatMoney(txn.amountCents, ctx.currency, ctx.locale),
      description: txn.description,
      category: txn.category?.name ?? null,
    }));
  return { ok: true, summary: `${rows.length} movements`, data: rows };
}

async function addMovement(
  ctx: FinanceToolContext,
  type: "expense" | "income",
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  if (!canSeeModule(ctx.visibility, "transactions")) {
    return { ok: false, summary: "No access to transactions", error: "forbidden" };
  }
  await requireHouseholdAccess(ctx.userId, { write: true });
  const description = str(args.description)?.trim();
  const amount = num(args.amount);
  if (!description) return { ok: false, summary: "Description is required", error: "description" };
  if (amount == null || amount <= 0) {
    return { ok: false, summary: "Amount must be greater than 0", error: "amount" };
  }
  const amountCents = pesosToCents(amount);
  if (amountCents <= 0) return { ok: false, summary: "Invalid amount", error: "amount" };
  const date = validDate(str(args.date)) || todayISO();

  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId, type },
    select: { id: true, name: true },
  });
  const category = await resolveNamed(
    str(args.category),
    categories.map((row) => ({ id: row.id, names: [row.name] })),
    "category"
  );
  if (category.status === "ambiguous") return category.result;
  let categoryId = category.id;
  if (!categoryId) {
    const suggested = suggestCategoryName(description);
    if (suggested) {
      const hit = categories.find((row) => fold(row.name) === fold(suggested));
      if (hit) categoryId = hit.id;
    }
  }

  const accounts = await prisma.account.findMany({
    where: { householdId: ctx.householdId, ownerUserId: null },
    select: { id: true, name: true },
  });
  const cards = await prisma.creditCard.findMany({
    where: { householdId: ctx.householdId },
    select: { id: true, name: true, lastFour: true },
  });

  const account = await resolveNamed(
    str(args.account),
    accounts.map((row) => ({ id: row.id, names: [row.name] })),
    "account"
  );
  if (account.status === "ambiguous") return account.result;
  const card = await resolveNamed(
    str(args.creditCard),
    cards.map((row) => ({ id: row.id, names: [row.name, row.lastFour] })),
    "credit card"
  );
  if (card.status === "ambiguous") return card.result;

  let accountId = account.id;
  let creditCardId = type === "expense" ? card.id : null;
  if (type === "income") creditCardId = null;

  if (!accountId && !creditCardId) {
    if (type === "income" && accounts.length === 1) {
      accountId = accounts[0].id;
    } else if (type === "expense" && accounts.length === 1 && cards.length === 0) {
      accountId = accounts[0].id;
    } else if (type === "expense" && accounts.length === 0 && cards.length === 1) {
      creditCardId = cards[0].id;
    } else {
      return {
        ok: false,
        summary: "Say which account or card to use",
        error: "payment_source",
        data: {
          accounts: accounts.map((row) => ({ id: row.id, name: row.name })),
          creditCards: cards.map((row) => ({
            id: row.id,
            name: row.name,
            lastFour: row.lastFour,
          })),
        },
      };
    }
  }

  if (accountId && !accounts.some((row) => row.id === accountId)) {
    return { ok: false, summary: "Account not found in this household", error: "account" };
  }
  if (creditCardId && !cards.some((row) => row.id === creditCardId)) {
    return { ok: false, summary: "Credit card not found in this household", error: "card" };
  }

  let spentById: string | null = null;
  if (type === "expense" && str(args.spentBy)) {
    const members = await prisma.membership.findMany({
      where: { householdId: ctx.householdId },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const spent = await resolveNamed(
      str(args.spentBy),
      members.map((row) => ({ id: row.userId, names: [row.user.displayName] })),
      "member"
    );
    if (spent.status === "ambiguous") return spent.result;
    spentById = spent.id;
  }

  let fundings: FundingInput[] = [];
  if (type === "expense") {
    if (creditCardId) {
      fundings = [{ amountCents, accountId: null, creditCardId }];
    } else if (accountId) {
      fundings = [{ amountCents, accountId, creditCardId: null }];
    }
    const legacy = legacyFieldsFromFundings(fundings);
    accountId = legacy.accountId;
    creditCardId = legacy.creditCardId;
  }

  const txn = await prisma.transaction.create({
    data: {
      householdId: ctx.householdId,
      date,
      amountCents,
      description,
      type,
      categoryId,
      accountId,
      creditCardId: type === "expense" ? creditCardId : null,
      createdById: ctx.userId,
      spentById,
    },
  });
  if (type === "expense" && fundings.length) {
    await prisma.transactionFunding.createMany({
      data: fundings.map((f) => ({
        transactionId: txn.id,
        amountCents: f.amountCents,
        accountId: f.accountId || null,
        creditCardId: f.creditCardId || null,
      })),
    });
  }
  const full = await prisma.transaction.findFirst({
    where: { id: txn.id },
    include: {
      category: true,
      account: true,
      creditCard: true,
      ...fundingInclude,
    },
  });
  await logActivity({
    householdId: ctx.householdId,
    userId: ctx.userId,
    action: "create",
    entityType: "transaction",
    entityId: txn.id,
    summary: `${type === "income" ? "Ingreso" : "Gasto"} (IA): ${description}`,
  });
  const money = formatMoney(amountCents, ctx.currency, ctx.locale);
  const via = full?.creditCard?.name || full?.account?.name || "";
  return {
    ok: true,
    mutated: true,
    summary: `${type === "income" ? "Income" : "Expense"} ${money} · ${description}${via ? ` · ${via}` : ""}`,
    data: {
      id: txn.id,
      date,
      type,
      amount: money,
      description,
      category: full?.category?.name ?? null,
      account: full?.account?.name ?? null,
      creditCard: full?.creditCard?.name ?? null,
    },
  };
}

async function updateMovement(
  ctx: FinanceToolContext,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  await requireHouseholdAccess(ctx.userId, { write: true });
  const id = str(args.id);
  if (!id) return { ok: false, summary: "id is required", error: "id" };
  const existing = await prisma.transaction.findFirst({
    where: { id, householdId: ctx.householdId, deletedAt: null },
    include: { fundings: true, category: true },
  });
  if (!existing) return { ok: false, summary: "Transaction not found", error: "not_found" };
  if (existing.type === "cc_payment" || existing.type === "transfer") {
    return {
      ok: false,
      summary: "Card payments and transfers cannot be edited from the assistant",
      error: "type",
    };
  }

  const amountCents =
    args.amount !== undefined && args.amount !== null
      ? pesosToCents(num(args.amount) ?? 0)
      : existing.amountCents;
  if (amountCents <= 0) return { ok: false, summary: "Invalid amount", error: "amount" };
  const date = validDate(str(args.date)) || existing.date;
  const description = str(args.description)?.trim() || existing.description;

  let categoryId = existing.categoryId;
  if (args.category !== undefined) {
    const categories = await prisma.category.findMany({
      where: {
        householdId: ctx.householdId,
        type: existing.type === "income" ? "income" : "expense",
      },
      select: { id: true, name: true },
    });
    const category = await resolveNamed(
      str(args.category),
      categories.map((row) => ({ id: row.id, names: [row.name] })),
      "category"
    );
    if (category.status === "ambiguous") return category.result;
    categoryId = category.id;
  }

  if (existing.type === "expense" && existing.fundings.length === 1 && amountCents !== existing.amountCents) {
    await prisma.transactionFunding.update({
      where: { id: existing.fundings[0].id },
      data: { amountCents },
    });
  }

  const txn = await prisma.transaction.update({
    where: { id: existing.id },
    data: { date, amountCents, description, categoryId },
    include: { category: true, account: true, creditCard: true },
  });
  const money = formatMoney(txn.amountCents, ctx.currency, ctx.locale);
  return {
    ok: true,
    mutated: true,
    summary: `Updated ${txn.description} · ${money}`,
    data: {
      id: txn.id,
      date: txn.date,
      amount: money,
      description: txn.description,
      category: txn.category?.name ?? null,
    },
  };
}

async function deleteMovement(ctx: FinanceToolContext, id?: string): Promise<ToolExecResult> {
  await requireHouseholdAccess(ctx.userId, { write: true });
  if (!id) return { ok: false, summary: "id is required", error: "id" };
  const existing = await prisma.transaction.findFirst({
    where: { id, householdId: ctx.householdId, deletedAt: null },
  });
  if (!existing) return { ok: false, summary: "Transaction not found", error: "not_found" };
  await prisma.transaction.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), installmentPlanId: null },
  });
  if (existing.installmentPlanId) {
    await prisma.installmentPlan.deleteMany({
      where: { id: existing.installmentPlanId, householdId: ctx.householdId },
    });
  }
  return {
    ok: true,
    mutated: true,
    summary: `Deleted ${existing.description}`,
    data: { id: existing.id },
  };
}

type ResolveOk = { status: "ok"; id: string | null };
type ResolveAmb = { status: "ambiguous"; result: ToolExecResult };

async function resolveNamed(
  hint: string | undefined,
  rows: { id: string; names: (string | null | undefined)[] }[],
  label: string
): Promise<ResolveOk | ResolveAmb> {
  if (!hint) return { status: "ok", id: null };
  const exactId = rows.find((row) => row.id === hint);
  if (exactId) return { status: "ok", id: exactId.id };
  const scored = rows
    .map((row) => ({ id: row.id, names: row.names, score: bestScore(hint, row.names) }))
    .filter((row) => row.score >= 60)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored[0] && scored[0].score >= 90 && (!scored[1] || scored[0].score - scored[1].score >= 15))) {
    return { status: "ok", id: scored[0].id };
  }
  if (!scored.length) {
    return {
      status: "ambiguous",
      result: {
        ok: false,
        summary: `No ${label} matched "${hint}"`,
        error: "not_found",
        data: { candidates: rows.slice(0, 12).map((row) => ({ id: row.id, name: row.names[0] })) },
      },
    };
  }
  return {
    status: "ambiguous",
    result: {
      ok: false,
      summary: `Several ${label}s match "${hint}". Pick one.`,
      error: "ambiguous",
      data: {
        candidates: scored.slice(0, 8).map((row) => ({ id: row.id, name: row.names[0], score: row.score })),
      },
    },
  };
}

function bestScore(query: string, names: (string | null | undefined)[]): number {
  return Math.max(0, ...names.map((name) => matchScore(query, name)));
}

function matchScore(query: string, name?: string | null): number {
  const q = fold(query);
  const n = fold(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 82;
  if (n.includes(q) || q.includes(n)) return 68;
  return 0;
}

function fold(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function validDate(value?: string): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
