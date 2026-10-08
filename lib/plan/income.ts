import { shiftMonth } from "../calendar";
import { eventsInMonth, expectedEventCents, fullEventCents, type EventLike } from "./events";

// Income for planning. Paychecks are steady. Business income is a forecast: an amount, how much to count on it
// (confidence), and which months it applies to. The plan counts amount x confidence.

export type IncomeRowLike = {
  amountCents: number;
  kind: "steady" | "variable";
  confidencePercent: number | null;
  startsOn: string | null; // YYYY-MM-DD, first month it applies
  endsOn: string | null; // YYYY-MM-DD, last month it applies. null = no end
};

/** Which level of business income the plan counts. */
export type IncomeView = "steady" | "expected" | "full";

export const VIEW_LABEL: Record<IncomeView, string> = {
  steady: "Paychecks only",
  expected: "Paychecks plus the business at your confidence",
  full: "Paychecks plus the business at full amount",
};

const confidenceOf = (r: IncomeRowLike) => Math.min(100, Math.max(0, r.confidencePercent ?? 100));

/** What to count on from one business forecast: the amount times your confidence in it. */
export const expectedOf = (r: IncomeRowLike): number => Math.round((r.amountCents * confidenceOf(r)) / 100);

export function confidenceLabel(percent: number): string {
  return percent <= 40 ? "low" : percent <= 70 ? "medium" : "high";
}

/** Is a forecast row in effect during a month (YYYY-MM)? */
export function activeIn(r: IncomeRowLike, month: string): boolean {
  if (r.startsOn && r.startsOn.slice(0, 7) > month) return false;
  if (r.endsOn && r.endsOn.slice(0, 7) < month) return false;
  return true;
}

export type IncomeScenarios = {
  hasSteady: boolean;
  hasVariable: boolean; // any business forecast at all, in any month
  activeVariable: boolean; // one applies to this month
  steadyCents: number;
  expectedCents: number; // business income this month at your confidence
  fullCents: number; // business income this month if everything goes well
};

export function incomeScenarios(rows: IncomeRowLike[], month: string): IncomeScenarios {
  const steady = rows.filter((r) => r.kind === "steady");
  const variable = rows.filter((r) => r.kind === "variable");
  const active = variable.filter((r) => activeIn(r, month));
  return {
    hasSteady: steady.length > 0,
    hasVariable: variable.length > 0,
    activeVariable: active.length > 0,
    steadyCents: steady.reduce((s, r) => s + r.amountCents, 0),
    expectedCents: active.reduce((s, r) => s + expectedOf(r), 0),
    fullCents: active.reduce((s, r) => s + r.amountCents, 0),
  };
}

export function incomeForView(s: IncomeScenarios, view: IncomeView): number {
  return s.steadyCents + (view === "full" ? s.fullCents : view === "expected" ? s.expectedCents : 0);
}

/** Default view: count the business at the confidence you gave, not the best case. */
export function defaultView(s: IncomeScenarios): IncomeView {
  return s.hasVariable ? "expected" : "steady";
}

export function parseView(raw: string | undefined, s: IncomeScenarios): IncomeView {
  return raw === "steady" || raw === "expected" || raw === "full" ? raw : defaultView(s);
}

export type SurplusByView = { steady: number | null; expected: number | null; full: number | null };

/** What is left each month under each view, after living costs and scheduled debt payments. */
export function surplusByView(s: IncomeScenarios, livingCents: number | null, obligationCents: number): SurplusByView {
  const left = (view: IncomeView) => (livingCents == null ? null : incomeForView(s, view) - livingCents - obligationCents);
  return { steady: left("steady"), expected: left("expected"), full: left("full") };
}

/** What the business must bring in each month, when paychecks alone fall short. Zero when they do not. */
export function breakEvenFromVariable(s: IncomeScenarios, livingCents: number | null, obligationCents: number): number | null {
  if (livingCents == null) return null;
  return Math.max(0, livingCents + obligationCents - s.steadyCents);
}


type Triple = { steady: number; expected: number; full: number };

export type OutlookMonth = {
  month: string;
  steadyCents: number;
  expectedCents: number;
  fullCents: number;
  livingCents: number;
  /** Scheduled debt payments. They only differ in "full", where debts an event pays off stop being paid. */
  obligations: Triple;
  /** One-time money this month. Paychecks-only counts none. "Expected" counts the cash at your confidence. "Full" counts it in full, less what it pays off. */
  events: Triple;
  /** What the month leaves from income after living costs and debt payments, not counting one-time money. */
  left: Triple;
  /** Cash after this month: the starting cash plus every month's leftover and one-time money so far. */
  balance: Triple;
  /** Debts paid off this month in the "full" view. */
  paidOffFull: { debtId: string; costCents: number }[];
};

export type OutlookOptions = {
  rows: IncomeRowLike[];
  events: EventLike[];
  startMonth: string;
  months: number;
  livingCents: number;
  cashCents?: number;
  /** Scheduled debt payments in a month, leaving out debts that are already paid off. */
  obligationsFor: (month: string, paidOff: ReadonlySet<string>) => number;
  /** What it costs to pay one debt off in a month. */
  payoffCostFor: (debtId: string, month: string) => number;
};

/**
 * Month by month. Debt payments come from `obligationsFor`, which knows when settlements end, so the picture improves as
 * debts finish. Living costs are held constant. One-time events land in their month, and a running cash balance shows
 * whether the money lasts. In the "full" view an event also pays off the debts it names, and their monthly payments
 * stop from the next month.
 */
export function outlook(o: OutlookOptions): OutlookMonth[] {
  const cash = o.cashCents ?? 0;
  const running: Triple = { steady: cash, expected: cash, full: cash };
  const paid = new Set<string>(); // debts paid off so far in the "full" view
  const none: ReadonlySet<string> = new Set();

  return Array.from({ length: o.months }, (_, i) => {
    const month = shiftMonth(o.startMonth, i);
    const s = incomeScenarios(o.rows, month);
    const base = o.obligationsFor(month, none);
    const obligations: Triple = { steady: base, expected: base, full: o.obligationsFor(month, paid) };

    const inMonth = eventsInMonth(o.events, month);
    const paidOffFull: { debtId: string; costCents: number }[] = [];
    let fullEvents = 0;
    for (const e of inMonth) {
      fullEvents += fullEventCents(e);
      if (e.direction === "in") {
        for (const id of e.payoffDebtIds ?? []) {
          if (paid.has(id) || paidOffFull.some((p) => p.debtId === id)) continue;
          const costCents = o.payoffCostFor(id, month);
          paidOffFull.push({ debtId: id, costCents });
          fullEvents -= costCents;
        }
      }
    }
    const events: Triple = { steady: 0, expected: inMonth.reduce((t, e) => t + expectedEventCents(e), 0), full: fullEvents };

    const left: Triple = {
      steady: s.steadyCents - o.livingCents - obligations.steady,
      expected: s.steadyCents + s.expectedCents - o.livingCents - obligations.expected,
      full: s.steadyCents + s.fullCents - o.livingCents - obligations.full,
    };
    for (const v of ["steady", "expected", "full"] as const) running[v] += left[v] + events[v];
    for (const p of paidOffFull) paid.add(p.debtId); // their payments stop from next month

    return { month, steadyCents: s.steadyCents, expectedCents: s.expectedCents, fullCents: s.fullCents, livingCents: o.livingCents, obligations, events, left, balance: { ...running }, paidOffFull };
  });
}

/** The first month the running cash balance goes below zero in a view, or null if it never does. */
export function cashRunsOut(months: OutlookMonth[], view: IncomeView): string | null {
  return months.find((m) => m.balance[view] < 0)?.month ?? null;
}
