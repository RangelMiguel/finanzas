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
  showDashboardIncome: false,
  showDashboardBalance: false,
  showRecurringIncomes: false,
  showDebtBalances: false,
  showExport: false,
  onlyOwnTransactions: true,
  showOtherMembers: false,
};

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
  type: string;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  creditCardId?: string | null;
  createdById?: string | null;
  spentById?: string | null;
};

export function filterTransaction(
  vis: MemberVisibility,
  txn: TxnFilterable,
  userId: string
): boolean {
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
    const mine =
      txn.createdById === userId ||
      txn.spentById === userId;
    if (!mine) return false;
  }
  return true;
}

export function maskAmount(vis: MemberVisibility, cents: number): number | null {
  // helper for clients; server usually omits fields
  return cents;
}
