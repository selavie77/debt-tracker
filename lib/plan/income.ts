import { shiftMonth } from "../calendar";
import { allocatePayoffs, eventsInMonth, happensInExpected, type EventLike, type Payoff } from "./events";

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
  expected: "What you expect",
  full: "Best case",
};

/** What each view counts, in words. */
export const VIEW_DESCRIPTION: Record<IncomeView, string> = {
  steady: "Paychecks only. No business income and no one-time events.",
  expected: "Paychecks, plus the business at your confidence, plus one-time events you are sure enough of (money in at 50% or more, money out at 25% or more), in full.",
  full: "Paychecks, plus the business at its full amount, plus every one-time event, in full.",
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
  /** Scheduled debt payments. They fall in "expected" and "full" once an event pays a debt off. */
  obligations: Triple;
  /** One-time money this month, after what it pays off. Paychecks-only counts none. */
  events: Triple;
  /** What the month leaves from income after living costs and debt payments, not counting one-time money. */
  left: Triple;
  /** Cash after this month: the starting cash plus every month's leftover and one-time money so far. */
  balance: Triple;
  /** Debts paid off this month, in each view. */
  paidOff: { expected: Payoff[]; full: Payoff[] };
};

export type OutlookOptions = {
  rows: IncomeRowLike[];
  /** Events. Each one's payoffDebtIds should already be in the order to pay them. */
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
 * debts finish. Living costs are held constant. One-time events land in their month and a running cash balance shows
 * whether the money lasts. When an event happens it pays off the debts it names, in order, for as long as the money
 * covers them, and those debts' payments stop from the next month. "Expected" counts the events you are sure enough of
 * and "full" counts all of them. "Steady" counts none.
 */
export function outlook(o: OutlookOptions): OutlookMonth[] {
  const cash = o.cashCents ?? 0;
  const running: Triple = { steady: cash, expected: cash, full: cash };
  const paid = { expected: new Set<string>(), full: new Set<string>() }; // debts paid off so far in each view
  const none: ReadonlySet<string> = new Set();

  return Array.from({ length: o.months }, (_, i) => {
    const month = shiftMonth(o.startMonth, i);
    const s = incomeScenarios(o.rows, month);
    const base = o.obligationsFor(month, none);
    const obligations: Triple = { steady: base, expected: o.obligationsFor(month, paid.expected), full: o.obligationsFor(month, paid.full) };

    const inMonth = eventsInMonth(o.events, month);
    const events: Triple = { steady: 0, expected: 0, full: 0 };
    const paidOff = { expected: [] as Payoff[], full: [] as Payoff[] };
    for (const view of ["expected", "full"] as const) {
      for (const e of inMonth) {
        if (view === "expected" && !happensInExpected(e)) continue;
        if (e.direction === "out") {
          events[view] -= e.amountCents;
          continue;
        }
        const a = allocatePayoffs(e.amountCents, e.payoffDebtIds ?? [], (id) => o.payoffCostFor(id, month), new Set([...paid[view], ...paidOff[view].map((p) => p.debtId)]));
        paidOff[view].push(...a.paid);
        events[view] += a.leftCents;
      }
    }

    const left: Triple = {
      steady: s.steadyCents - o.livingCents - obligations.steady,
      expected: s.steadyCents + s.expectedCents - o.livingCents - obligations.expected,
      full: s.steadyCents + s.fullCents - o.livingCents - obligations.full,
    };
    for (const v of ["steady", "expected", "full"] as const) running[v] += left[v] + events[v];
    for (const view of ["expected", "full"] as const) for (const p of paidOff[view]) paid[view].add(p.debtId); // their payments stop from next month

    return { month, steadyCents: s.steadyCents, expectedCents: s.expectedCents, fullCents: s.fullCents, livingCents: o.livingCents, obligations, events, left, balance: { ...running }, paidOff };
  });
}

/** The first month the running cash balance goes below zero in a view, or null if it never does. */
export function cashRunsOut(months: OutlookMonth[], view: IncomeView): string | null {
  return months.find((m) => m.balance[view] < 0)?.month ?? null;
}