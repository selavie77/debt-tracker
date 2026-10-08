import { shiftMonth } from "../calendar";
import { toCents } from "../money";

// One-time money the user expects: selling a property, a tax refund, a large bill.
// An event can also pay off named debts. When it happens, their payments stop from the next month.

export type EventLike = {
  direction: "in" | "out";
  amountCents: number; // always positive
  expectedMonth: string; // YYYY-MM-DD, the first day of the month
  confidencePercent: number;
  /** Debts this event is meant to pay off when it happens (money in only). */
  payoffDebtIds?: string[];
};

const sign = (e: EventLike) => (e.direction === "in" ? 1 : -1);

/** Signed amount if it happens in full: money in is positive, money out is negative. */
export const fullEventCents = (e: EventLike): number => sign(e) * e.amountCents;

/**
 * Does the plan count it as happening when it counts "what you expect"? A one-time event either happens or it does not,
 * so it is not scaled by confidence. Money in counts when you are at least 50% sure. Money out counts from 25%, so a
 * possible bill is not ignored. The best-case view counts every event.
 */
export const HAPPENS_AT = { in: 50, out: 25 } as const;
export const happensInExpected = (e: EventLike): boolean => e.confidencePercent >= HAPPENS_AT[e.direction];

/** Signed amount counted in the "what you expect" view: the full amount, or nothing. */
export const expectedEventCents = (e: EventLike): number => (happensInExpected(e) ? fullEventCents(e) : 0);

export type Payoff = { debtId: string; costCents: number };

/**
 * Pays off debts, in the order given, for as long as each one fits in the money that is left. A debt that does not fit is
 * left alone and the next one is tried. Debts already paid off by an earlier event are skipped.
 */
export function allocatePayoffs(
  amountCents: number,
  orderedDebtIds: string[],
  costFor: (debtId: string) => number,
  alreadyPaid: ReadonlySet<string> = new Set(),
): { paid: Payoff[]; notCovered: Payoff[]; leftCents: number } {
  let remaining = amountCents;
  const paid: Payoff[] = [];
  const notCovered: Payoff[] = [];
  for (const debtId of orderedDebtIds) {
    if (alreadyPaid.has(debtId)) continue;
    const costCents = costFor(debtId);
    if (costCents <= remaining) {
      paid.push({ debtId, costCents });
      remaining -= costCents;
    } else {
      notCovered.push({ debtId, costCents });
    }
  }
  return { paid, notCovered, leftCents: remaining };
}
export const eventsInMonth = <T extends EventLike>(events: T[], month: string): T[] => events.filter((e) => e.expectedMonth.slice(0, 7) === month);

export type EventInput = { name: string; direction: string; amount: string; month: string; confidence: string; note?: string; debtIds?: string[] };
export type EventRow = { name: string; direction: "in" | "out"; amountCents: number; expectedMonth: string; confidencePercent: number; note: string; payoffDebtIds: string[] };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseEvent(i: EventInput): { error: string } | { row: EventRow } {
  const name = i.name.trim();
  if (!name) return { error: "Enter what it is, such as Sale of the property" };
  if (i.direction !== "in" && i.direction !== "out") return { error: "Choose whether money comes in or goes out" };
  const amountCents = toCents(i.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter a dollar amount more than zero" };
  const month = i.month.trim();
  if (!MONTH.test(month)) return { error: "Choose the month you expect it" };
  const raw = i.confidence.trim().replace(/%$/, "");
  const confidence = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 100) return { error: "Enter your confidence as a number from 1 to 100" };
  const payoffDebtIds = i.direction === "in" ? [...new Set((i.debtIds ?? []).filter(Boolean))] : [];
  return { row: { name, direction: i.direction, amountCents, expectedMonth: `${month}-01`, confidencePercent: confidence, note: (i.note ?? "").trim(), payoffDebtIds } };
}

/** Months from `from` (YYYY-MM) to `to` (YYYY-MM), 0 for the same month. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export { shiftMonth };
