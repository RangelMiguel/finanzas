/**
 * Per-member visibility / security policy.
 * Owners & admins always get full access regardless of stored flags.
 */

export type MemberVisibility = {
  // —— Modules (pages / areas) ——
  modules: {
    dashboard: boolean;
    accounts: boolean;
    transactions: boolean;
    budgets: boolean;
    creditCards: boolean;
    recurring: boolean;
    debts: boolean;
    allowances: boolean;
    goals: boolean;
    retirement: boolean;
    safeToSpend: boolean;
    tickets: boolean;
    statements: boolean;
    importExport: boolean;
    family: boolean;
    settings: boolean;
    activity: boolean;
  };

  // —— Transaction types ——
  showIncome: boolean;
  showExpense: boolean;
  showTransfers: boolean;

  // —— Account / money detail ——
  showAccountBalances: boolean;
  /** Empty = all accounts visible (except none when accounts module off) */
  hiddenAccountIds: string[];
  /** If non-empty, ONLY these accounts are visible (takes precedence over hidden) */
  allowedAccountIds: string[];

  // —— Categories ——
  hiddenCategoryIds: string[];
  allowedCategoryIds: string[];

  // —— Cards / debts ——
  hiddenCreditCardIds: string[];
  hiddenDebtIds: string[];

  // —— Granular item hides ——
  /** Specific transactions hidden from this member */
  hiddenTransactionIds: string[];
  /** Specific budget rows (category×period) hidden from this member */
  hiddenBudgetIds: string[];

  // —— Member scope ——
  /** Only transactions createdBy or spentBy self */
  onlyOwnTransactions: boolean;
  /** See other members' names on activity / spent-by */
  showOtherMembers: boolean;

  // —— Sensitive aggregates ——
  showDashboardIncome: boolean;
  showDashboardExpense: boolean;
  showDashboardBalance: boolean;
  showBudgets: boolean;
  showRecurringIncomes: boolean;
  showDebtBalances: boolean;
  showExport: boolean;
};

export const FULL_VISIBILITY: MemberVisibility = {
  modules: {
    dashboard: true,
    accounts: true,
    transactions: true,
    budgets: true,
    creditCards: true,
    recurring: true,
    debts: true,
    allowances: true,
    goals: true,
    retirement: true,
    safeToSpend: true,
    tickets: true,
    statements: true,
    importExport: true,
    family: true,
    settings: true,
    activity: true,
  },
  showIncome: true,
  showExpense: true,
  showTransfers: true,
  showAccountBalances: true,
  hiddenAccountIds: [],
  allowedAccountIds: [],
  hiddenCategoryIds: [],
  allowedCategoryIds: [],
  hiddenCreditCardIds: [],
  hiddenDebtIds: [],
  hiddenTransactionIds: [],
  hiddenBudgetIds: [],
  onlyOwnTransactions: false,
  showOtherMembers: true,
  showDashboardIncome: true,
  showDashboardExpense: true,
  showDashboardBalance: true,
  showBudgets: true,
  showRecurringIncomes: true,
  showDebtBalances: true,
  showExport: true,
};

/** Stricter template for kids / limited members */
export const LIMITED_VISIBILITY: MemberVisibility = {
  ...FULL_VISIBILITY,
  modules: {
    ...FULL_VISIBILITY.modules,
    debts: false,
    importExport: false,
    family: false,
    settings: false,
    statements: false,
    activity: false,
  },
  showIncome: false,
  showTransfers: false,
  showAccountBalances: false,
  showDashboardIncome: false,
  showDashboardBalance: false,
  showRecurringIncomes: false,
  showDebtBalances: false,
  showExport: false,
  // Expenses stay household-visible (parents log family spend; budgets need them).
  // onlyOwn still privacy-filters income/transfers when those types are enabled.
  onlyOwnTransactions: true,
  showOtherMembers: false,
};

/** Kids / allowance: expenses + budgets, no balances / household money */
export const SPEND_ONLY_VISIBILITY: MemberVisibility = {
  ...LIMITED_VISIBILITY,
  showIncome: false,
  showExpense: true,
  showTransfers: false,
  showAccountBalances: false,
  onlyOwnTransactions: true,
  showDashboardIncome: false,
  showDashboardExpense: true,
  showDashboardBalance: false,
  modules: {
    ...LIMITED_VISIBILITY.modules,
    accounts: true, // names for pickers; balances still hidden
    transactions: true,
    budgets: true,
    safeToSpend: false,
    tickets: true,
    creditCards: false,
    goals: false,
    retirement: false,
  },
};

/** Compare policy shape ignoring hide-lists (categories etc. are extras on top of a level). */
export function accessLevelOf(
  p: MemberVisibility
): "full" | "limited" | "spend" | "custom" {
  const strip = (v: MemberVisibility) => ({
    modules: v.modules,
    showIncome: v.showIncome,
    showExpense: v.showExpense,
    showTransfers: v.showTransfers,
    showAccountBalances: v.showAccountBalances,
    onlyOwnTransactions: v.onlyOwnTransactions,
    showOtherMembers: v.showOtherMembers,
    showDashboardIncome: v.showDashboardIncome,
    showDashboardExpense: v.showDashboardExpense,
    showDashboardBalance: v.showDashboardBalance,
    showBudgets: v.showBudgets,
    showRecurringIncomes: v.showRecurringIncomes,
    showDebtBalances: v.showDebtBalances,
    showExport: v.showExport,
  });
  const a = JSON.stringify(strip(p));
  if (a === JSON.stringify(strip(FULL_VISIBILITY))) return "full";
  if (a === JSON.stringify(strip(SPEND_ONLY_VISIBILITY))) return "spend";
  if (a === JSON.stringify(strip(LIMITED_VISIBILITY))) return "limited";
  return "custom";
}

export function parseVisibility(raw: unknown): MemberVisibility {
  let obj: Partial<MemberVisibility> = {};
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw || "{}");
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Partial<MemberVisibility>;
  }

  const modules = {
    ...FULL_VISIBILITY.modules,
    ...(obj.modules || {}),
  };

  return {
    ...FULL_VISIBILITY,
    ...obj,
    modules,
    hiddenAccountIds: arr(obj.hiddenAccountIds),
    allowedAccountIds: arr(obj.allowedAccountIds),
    hiddenCategoryIds: arr(obj.hiddenCategoryIds),
    allowedCategoryIds: arr(obj.allowedCategoryIds),
    hiddenCreditCardIds: arr(obj.hiddenCreditCardIds),
    hiddenDebtIds: arr(obj.hiddenDebtIds),
    hiddenTransactionIds: arr(obj.hiddenTransactionIds),
    hiddenBudgetIds: arr(obj.hiddenBudgetIds),
  };
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export function serializeVisibility(v: MemberVisibility): string {
  return JSON.stringify(v);
}

export function isPrivilegedRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Effective visibility: owners/admins always full */
export function effectiveVisibility(
  role: string,
  raw: unknown
): MemberVisibility {
  if (isPrivilegedRole(role)) return { ...FULL_VISIBILITY };
  return parseVisibility(raw);
}

export function canSeeModule(
  vis: MemberVisibility,
  module: keyof MemberVisibility["modules"]
): boolean {
  return !!vis.modules[module];
}

/**
 * Account *names* are needed for movements, budgets, goals pickers, etc.
 * Balances only when the accounts module is on AND showAccountBalances.
 */
export function canListAccounts(vis: MemberVisibility): boolean {
  return (
    canSeeModule(vis, "accounts") ||
    canSeeModule(vis, "transactions") ||
    canSeeModule(vis, "budgets") ||
    canSeeModule(vis, "goals") ||
    canSeeModule(vis, "safeToSpend") ||
    canSeeModule(vis, "recurring") ||
    canSeeModule(vis, "allowances")
  );
}

/** Card names for expense "paid with" pickers even without the credit-cards module. */
export function canListCreditCards(vis: MemberVisibility): boolean {
  return (
    canSeeModule(vis, "creditCards") || canSeeModule(vis, "transactions")
  );
}

export function canSeeAccountBalances(vis: MemberVisibility): boolean {
  return canSeeModule(vis, "accounts") && !!vis.showAccountBalances;
}

export function filterAccountId(
  vis: MemberVisibility,
  accountId: string | null | undefined
): boolean {
  if (!accountId) return true;
  if (vis.allowedAccountIds.length > 0) {
    return vis.allowedAccountIds.includes(accountId);
  }
  return !vis.hiddenAccountIds.includes(accountId);
}

export function filterCategoryId(
  vis: MemberVisibility,
  categoryId: string | null | undefined
): boolean {
  if (!categoryId) return true;
  if (vis.allowedCategoryIds.length > 0) {
    return vis.allowedCategoryIds.includes(categoryId);
  }
  return !vis.hiddenCategoryIds.includes(categoryId);
}

export function filterTxnType(vis: MemberVisibility, type: string): boolean {
  if (type === "income") return vis.showIncome;
  if (type === "expense") return vis.showExpense;
  if (type === "transfer") return vis.showTransfers;
  return true;
}

export type TxnFilterable = {
  id?: string;
  type: string;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  creditCardId?: string | null;
  createdById?: string | null;
  spentById?: string | null;
};

export type BudgetFilterable = {
  id: string;
  categoryId: string;
};

export function filterBudget(
  vis: MemberVisibility,
  budget: BudgetFilterable
): boolean {
  if (vis.hiddenBudgetIds.includes(budget.id)) return false;
  if (!filterCategoryId(vis, budget.categoryId)) return false;
  return true;
}

export function filterTransaction(
  vis: MemberVisibility,
  txn: TxnFilterable,
  userId: string
): boolean {
  if (txn.id && vis.hiddenTransactionIds.includes(txn.id)) return false;
  if (!filterTxnType(vis, txn.type)) return false;
  if (!filterCategoryId(vis, txn.categoryId)) return false;
  if (txn.accountId && !filterAccountId(vis, txn.accountId)) return false;
  if (txn.toAccountId && !filterAccountId(vis, txn.toAccountId)) return false;
  if (
    txn.creditCardId &&
    vis.hiddenCreditCardIds.includes(txn.creditCardId)
  ) {
    return false;
  }
  if (vis.onlyOwnTransactions) {
    /**
     * Expenses are household-shared for budget tracking.
     * Parents/admins often log family spending under their own user id
     * (createdBy + default spentBy). Hiding those made "spend only" /
     * limited members see empty movements — incorrect for kids/partners
     * who should see expenses but not balances or income.
     *
     * onlyOwn still privacy-filters income and transfers to the member's
     * own activity when those types are visible.
     */
    if (txn.type !== "expense") {
      const mine =
        txn.createdById === userId || txn.spentById === userId;
      if (!mine) return false;
    }
  }
  return true;
}

export function maskAmount(vis: MemberVisibility, cents: number): number | null {
  // helper for clients; server usually omits fields
  return cents;
}
