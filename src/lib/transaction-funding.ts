import { amountToCents } from "@/lib/utils";

export type FundingInput = {
  amountCents: number;
  accountId?: string | null;
  creditCardId?: string | null;
};

export type FundingSourceKey = string; // "account:<id>" | "card:<id>"

export function sourceKey(kind: "account" | "card", id: string): FundingSourceKey {
  return `${kind}:${id}`;
}

export function parseSourceKey(
  key: string
): { kind: "account" | "card"; id: string } | null {
  if (key.startsWith("account:")) {
    return { kind: "account", id: key.slice("account:".length) };
  }
  if (key.startsWith("card:")) {
    return { kind: "card", id: key.slice("card:".length) };
  }
  return null;
}

/** Accept amount as number/string pesos or precomputed cents. */
export function fundingAmountToCents(amount: number | string): number {
  return amountToCents(amount);
}

/**
 * Validate and normalize payment splits for an expense.
 * Each line must be either account or card (not both / not neither).
 * Sums must equal totalCents.
 */
export function normalizeExpenseFundings(
  raw: {
    amount?: number | string;
    amountCents?: number;
    accountId?: string | null;
    creditCardId?: string | null;
    source?: string;
  }[],
  totalCents: number
): FundingInput[] {
  if (!raw.length) {
    throw new Error("Selecciona al menos una forma de pago");
  }

  const fundings: FundingInput[] = raw.map((r) => {
    let accountId = r.accountId || null;
    let creditCardId = r.creditCardId || null;
    if (r.source) {
      const parsed = parseSourceKey(r.source);
      if (!parsed) throw new Error("Forma de pago inválida");
      if (parsed.kind === "account") {
        accountId = parsed.id;
        creditCardId = null;
      } else {
        creditCardId = parsed.id;
        accountId = null;
      }
    }
    const amountCents =
      r.amountCents != null
        ? Math.round(r.amountCents)
        : fundingAmountToCents(r.amount ?? 0);

    if (amountCents <= 0) throw new Error("Cada pago debe ser mayor a 0");
    if (Boolean(accountId) === Boolean(creditCardId)) {
      throw new Error("Cada pago debe ser una cuenta o una tarjeta");
    }
    return { amountCents, accountId, creditCardId };
  });

  const sum = fundings.reduce((s, f) => s + f.amountCents, 0);
  if (sum !== totalCents) {
    throw new Error(
      `La suma de pagos (${(sum / 100).toFixed(2)}) debe igualar el total (${(totalCents / 100).toFixed(2)})`
    );
  }

  return fundings;
}

/** Sync legacy single-source columns from fundings list. */
export function legacyFieldsFromFundings(fundings: FundingInput[]): {
  accountId: string | null;
  creditCardId: string | null;
} {
  const accountIds = [
    ...new Set(fundings.map((f) => f.accountId).filter(Boolean) as string[]),
  ];
  const cardIds = [
    ...new Set(
      fundings.map((f) => f.creditCardId).filter(Boolean) as string[]
    ),
  ];

  // Single pure source keeps clean legacy fields
  if (fundings.length === 1) {
    return {
      accountId: fundings[0].accountId || null,
      creditCardId: fundings[0].creditCardId || null,
    };
  }

  // Multi: store first of each for list/filter hints; balances use fundings
  return {
    accountId: accountIds[0] || null,
    creditCardId: cardIds[0] || null,
  };
}

/** Build fundings from legacy accountId/creditCardId when no fundings rows. */
export function fundingsFromLegacy(txn: {
  amountCents: number;
  accountId?: string | null;
  creditCardId?: string | null;
  fundings?: FundingInput[] | null;
}): FundingInput[] {
  if (txn.fundings && txn.fundings.length > 0) {
    return txn.fundings.map((f) => ({
      amountCents: f.amountCents,
      accountId: f.accountId || null,
      creditCardId: f.creditCardId || null,
    }));
  }
  // Prefer card when both set (old UI defaulted an account)
  if (txn.creditCardId) {
    return [
      {
        amountCents: txn.amountCents,
        accountId: null,
        creditCardId: txn.creditCardId,
      },
    ];
  }
  if (txn.accountId) {
    return [
      {
        amountCents: txn.amountCents,
        accountId: txn.accountId,
        creditCardId: null,
      },
    ];
  }
  return [];
}
