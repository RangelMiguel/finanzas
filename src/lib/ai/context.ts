import { prisma } from "@/lib/db";
import { accountBalance } from "@/lib/money";
import { budgetPeriodKey, formatMoney } from "@/lib/utils";
import {
  canSeeAccountBalances,
  canSeeModule,
  filterTransaction,
  type MemberVisibility,
} from "@/lib/visibility";

function clip(text: string, max = 12_000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

export async function buildFinanceContext(opts: {
  householdId: string;
  visibility: MemberVisibility;
  subjectUserId: string;
  currency: string;
  householdName: string;
  locale: string;
}): Promise<string> {
  const { householdId, visibility, currency, householdName, locale } = opts;
  const period = budgetPeriodKey();
  const lines: string[] = [
    `App: Finance (household finances)`,
    `Household: ${householdName}`,
    `Currency: ${currency}`,
    `Period: ${period}`,
  ];

  if (canSeeModule(visibility, "accounts") && canSeeAccountBalances(visibility)) {
    const accounts = await prisma.account.findMany({
      where: { householdId, ownerUserId: null },
      select: { id: true, name: true, type: true, icon: true, initialBalanceCents: true },
      take: 20,
    });
    const txns = await prisma.transaction.findMany({
      where: { householdId, deletedAt: null },
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
    });
    lines.push("Accounts:");
    for (const acc of accounts) {
      const bal = accountBalance(acc.initialBalanceCents, txns, acc.id);
      lines.push(
        `- ${acc.icon} ${acc.name} (${acc.type}): ${formatMoney(bal, currency, locale)}`
      );
    }
  }

  if (canSeeModule(visibility, "transactions")) {
    const raw = await prisma.transaction.findMany({
      where: { householdId, deletedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 80,
      include: { category: { select: { name: true } } },
    });
    const visible = raw
      .filter((txn) => filterTransaction(visibility, txn, opts.subjectUserId))
      .slice(0, 35);
    lines.push("Recent movements:");
    for (const txn of visible) {
      const cat = txn.category?.name || "uncategorized";
      lines.push(
        `- ${txn.date} ${txn.type} ${formatMoney(txn.amountCents, currency, locale)} · ${txn.description} [${cat}]`
      );
    }
  }

  if (canSeeModule(visibility, "budgets") && visibility.showBudgets) {
    const budgets = await prisma.budget.findMany({
      where: { householdId, period },
      include: { category: { select: { name: true } } },
      take: 25,
    });
    if (budgets.length) {
      lines.push(`Budgets ${period}:`);
      for (const b of budgets) {
        lines.push(
          `- ${b.category.name}: planned ${formatMoney(b.amountCents, currency, locale)}`
        );
      }
    }
  }

  if (canSeeModule(visibility, "debts") && visibility.showDebtBalances) {
    const debts = await prisma.debt.findMany({
      where: { householdId },
      select: { name: true, principalCents: true, monthlyPaymentCents: true },
      take: 15,
    });
    if (debts.length) {
      lines.push("Debts:");
      for (const d of debts) {
        lines.push(
          `- ${d.name}: principal ${formatMoney(d.principalCents, currency, locale)}, monthly ${formatMoney(d.monthlyPaymentCents, currency, locale)}`
        );
      }
    }
  }

  if (canSeeModule(visibility, "goals")) {
    const goals = await prisma.goal.findMany({
      where: { householdId, status: "active" },
      select: { name: true, targetAmountCents: true },
      take: 12,
    });
    if (goals.length) {
      lines.push("Goals:");
      for (const g of goals) {
        lines.push(`- ${g.name}: target ${formatMoney(g.targetAmountCents, currency, locale)}`);
      }
    }
  }

  lines.push(
    "Grocery shops posted from the meat app appear as expenses (often auto-generated, description starts with meat / Compra meat)."
  );

  return clip(lines.join("\n"));
}
