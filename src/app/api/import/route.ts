import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { decryptBackup } from "@/lib/crypto-backup";
import { logActivity } from "@/lib/household";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const form = await req.formData();
    const password = String(form.get("password") || "");
    const file = form.get("file");
    if (!password || !(file instanceof File)) {
      throw new Error("Archivo y contraseña requeridos");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let json: string;
    try {
      json = await decryptBackup(buf, password);
    } catch {
      throw new Error("Contraseña incorrecta o archivo inválido");
    }
    const data = JSON.parse(json) as {
      accounts?: unknown[];
      categories?: unknown[];
      transactions?: unknown[];
      budgets?: unknown[];
      creditCards?: unknown[];
      installmentPlans?: unknown[];
      recurringIncomes?: unknown[];
      debts?: unknown[];
      debtPayments?: unknown[];
    };

    // Import as NEW rows (merge) — remap not implemented fully; simple JSON merge of non-conflicting shapes is complex.
    // Strategy: only import categories/accounts if empty-ish; always append transactions carefully.
    // Safer approach for v1: replace household finance data when mode=replace
    const mode = String(form.get("mode") || "merge");

    if (mode === "replace") {
      await prisma.$transaction([
        prisma.transaction.deleteMany({ where: { householdId: m.householdId } }),
        prisma.budget.deleteMany({ where: { householdId: m.householdId } }),
        prisma.debtPayment.deleteMany({ where: { householdId: m.householdId } }),
        prisma.debt.deleteMany({ where: { householdId: m.householdId } }),
        prisma.installmentPlan.deleteMany({ where: { householdId: m.householdId } }),
        prisma.recurringIncome.deleteMany({ where: { householdId: m.householdId } }),
        prisma.creditCard.deleteMany({ where: { householdId: m.householdId } }),
        prisma.account.deleteMany({ where: { householdId: m.householdId } }),
        prisma.category.deleteMany({ where: { householdId: m.householdId } }),
      ]);
    }

    const catMap = new Map<string, string>();
    const accMap = new Map<string, string>();
    const cardMap = new Map<string, string>();
    const debtMap = new Map<string, string>();
    const planMap = new Map<string, string>();

    type AnyRec = Record<string, unknown>;

    for (const c of (data.categories || []) as AnyRec[]) {
      const created = await prisma.category.create({
        data: {
          householdId: m.householdId,
          name: String(c.name),
          type: String(c.type || "expense"),
          icon: String(c.icon || "📦"),
          color: String(c.color || "#6366f1"),
          isDefault: Boolean(c.isDefault),
        },
      });
      if (c.id) catMap.set(String(c.id), created.id);
    }

    for (const a of (data.accounts || []) as AnyRec[]) {
      const created = await prisma.account.create({
        data: {
          householdId: m.householdId,
          name: String(a.name),
          type: String(a.type || "checking"),
          icon: String(a.icon || "🏦"),
          initialBalanceCents: Number(a.initialBalanceCents || 0),
        },
      });
      if (a.id) accMap.set(String(a.id), created.id);
    }

    for (const c of (data.creditCards || []) as AnyRec[]) {
      const created = await prisma.creditCard.create({
        data: {
          householdId: m.householdId,
          name: String(c.name),
          lastFour: String(c.lastFour || ""),
          cutoffDay: Number(c.cutoffDay || 1),
          graceDays: Number(c.graceDays || 20),
          color: String(c.color || "#8b5cf6"),
        },
      });
      if (c.id) cardMap.set(String(c.id), created.id);
    }

    for (const p of (data.installmentPlans || []) as AnyRec[]) {
      const created = await prisma.installmentPlan.create({
        data: {
          householdId: m.householdId,
          description: String(p.description),
          totalAmountCents: Number(p.totalAmountCents || 0),
          months: Number(p.months || 1),
          monthlyAmountCents: Number(p.monthlyAmountCents || 0),
          creditCardId: p.creditCardId
            ? cardMap.get(String(p.creditCardId)) || null
            : null,
          categoryId: p.categoryId
            ? catMap.get(String(p.categoryId)) || null
            : null,
          startDate: String(p.startDate || new Date().toISOString().slice(0, 10)),
        },
      });
      if (p.id) planMap.set(String(p.id), created.id);
    }

    for (const t of (data.transactions || []) as AnyRec[]) {
      const amountCents = Number(t.amountCents || 0);
      const legacyCard = t.creditCardId
        ? cardMap.get(String(t.creditCardId)) || null
        : null;
      const legacyAcc = t.accountId ? accMap.get(String(t.accountId)) || null : null;
      const rawFundings = Array.isArray(t.fundings) ? (t.fundings as AnyRec[]) : [];
      const fundingsCreate =
        rawFundings.length > 0
          ? rawFundings
              .map((f) => ({
                amountCents: Number(f.amountCents || 0),
                accountId: f.accountId
                  ? accMap.get(String(f.accountId)) || null
                  : null,
                creditCardId: f.creditCardId
                  ? cardMap.get(String(f.creditCardId)) || null
                  : null,
              }))
              .filter((f) => f.accountId || f.creditCardId)
          : legacyCard || legacyAcc
            ? [
                {
                  amountCents,
                  accountId: legacyCard ? null : legacyAcc,
                  creditCardId: legacyCard,
                },
              ]
            : [];

      await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date: String(t.date),
          amountCents,
          description: String(t.description || ""),
          type: String(t.type || "expense"),
          categoryId: t.categoryId
            ? catMap.get(String(t.categoryId)) || null
            : null,
          accountId: legacyCard ? null : legacyAcc,
          toAccountId: t.toAccountId
            ? accMap.get(String(t.toAccountId)) || null
            : null,
          creditCardId: legacyCard,
          installmentPlanId: t.installmentPlanId
            ? planMap.get(String(t.installmentPlanId)) || null
            : null,
          isAutoGenerated: Boolean(t.isAutoGenerated),
          createdById: session.userId,
          fundings:
            fundingsCreate.length > 0
              ? { create: fundingsCreate }
              : undefined,
        },
      });
    }

    for (const b of (data.budgets || []) as AnyRec[]) {
      const catId = b.categoryId ? catMap.get(String(b.categoryId)) : null;
      if (!catId) continue;
      await prisma.budget.upsert({
        where: {
          householdId_categoryId_period: {
            householdId: m.householdId,
            categoryId: catId,
            period: String(b.period || b.month || "").includes("-")
              ? String(b.period || b.month).match(/-\d$/)
                ? String(b.period || b.month)
                : `${String(b.month)}-1`
              : `${new Date().toISOString().slice(0, 7)}-1`,
          },
        },
        create: {
          householdId: m.householdId,
          categoryId: catId,
          amountCents: Number(b.amountCents || 0),
          period: String(b.period || b.month || "").match(/-\d$/)
            ? String(b.period || b.month)
            : `${String(b.month || new Date().toISOString().slice(0, 7))}-1`,
        },
        update: { amountCents: Number(b.amountCents || 0) },
      });
    }

    for (const r of (data.recurringIncomes || []) as AnyRec[]) {
      await prisma.recurringIncome.create({
        data: {
          householdId: m.householdId,
          description: String(r.description),
          amountCents: Number(r.amountCents || 0),
          categoryId: r.categoryId
            ? catMap.get(String(r.categoryId)) || null
            : null,
          accountId: r.accountId ? accMap.get(String(r.accountId)) || null : null,
          dayOfMonth: Number(r.dayOfMonth || 1),
          active: r.active !== false,
        },
      });
    }

    for (const d of (data.debts || []) as AnyRec[]) {
      const created = await prisma.debt.create({
        data: {
          householdId: m.householdId,
          name: String(d.name),
          principalCents: Number(d.principalCents || 0),
          annualRatePercent: Number(d.annualRatePercent || 0),
          monthlyPaymentCents: Number(d.monthlyPaymentCents || 0),
          paymentDay: Number(d.paymentDay || 1),
          notes: d.notes ? String(d.notes) : null,
        },
      });
      if (d.id) debtMap.set(String(d.id), created.id);
    }

    for (const p of (data.debtPayments || []) as AnyRec[]) {
      const debtId = p.debtId ? debtMap.get(String(p.debtId)) : null;
      if (!debtId) continue;
      await prisma.debtPayment.create({
        data: {
          householdId: m.householdId,
          debtId,
          date: String(p.date),
          capitalCents: Number(p.capitalCents || 0),
          interestCents: Number(p.interestCents || 0),
          accountId: p.accountId ? accMap.get(String(p.accountId)) || null : null,
          notes: p.notes ? String(p.notes) : null,
        },
      });
    }

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "import",
      entityType: "backup",
      summary: `Importó respaldo cifrado (modo ${mode})`,
    });

    return jsonOk({ ok: true, mode });
  } catch (e) {
    return jsonError(e);
  }
}
