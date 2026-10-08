// What a lump sum of cash could pay off, in full. This lists what fits. It does not say what to do.

export type PayoffCandidate = {
  id: string;
  name: string;
  owedCents: number;
  rateBps: number | null;
  monthlyCents: number; // what is paid on it each month today
  tier: 1 | 2 | 3; // how strongly a creditor can collect (see guidance.ts)
  settled: boolean; // paying a settled debt early saves no interest
};

export type PayoffOrder = "rate" | "tier";

export type PayoffResult = {
  ids: string[];
  usedCents: number;
  leftCents: number;
  interestPerYearSavedCents: number;
  monthlyFreedCents: number;
};

export function evaluatePayoffs(all: PayoffCandidate[], ids: string[], budgetCents: number): PayoffResult {
  const chosen = all.filter((c) => ids.includes(c.id));
  const usedCents = chosen.reduce((s, c) => s + c.owedCents, 0);
  return {
    ids: chosen.map((c) => c.id),
    usedCents,
    leftCents: budgetCents - usedCents,
    interestPerYearSavedCents: chosen.reduce((s, c) => s + (c.settled || c.rateBps == null ? 0 : Math.round((c.owedCents * c.rateBps) / 10000)), 0),
    monthlyFreedCents: chosen.reduce((s, c) => s + c.monthlyCents, 0),
  };
}

/**
 * Pays off whole debts in the chosen order for as long as each one fits in what is left, skipping any that do not fit and
 * trying the next. "rate" is highest interest rate first, "tier" is the debts creditors can collect most strongly first.
 */
export function suggestPayoffs(candidates: PayoffCandidate[], budgetCents: number, order: PayoffOrder): PayoffResult {
  const rate = (c: PayoffCandidate) => c.rateBps ?? 0;
  const sorted = [...candidates].sort((a, b) =>
    order === "rate" ? rate(b) - rate(a) || a.owedCents - b.owedCents : a.tier - b.tier || rate(b) - rate(a) || a.owedCents - b.owedCents,
  );
  let remaining = budgetCents;
  const ids: string[] = [];
  for (const c of sorted) {
    if (c.owedCents > 0 && c.owedCents <= remaining) {
      ids.push(c.id);
      remaining -= c.owedCents;
    }
  }
  return evaluatePayoffs(candidates, ids, budgetCents);
}
