import { toCents } from "./money";

export type IncomeInput = { name: string; amount: string; schedule: string; day: string; day2: string };
export type IncomeRow = { name: string; amountCents: number; dayOfMonth: number };

const asDay = (s: string): number | null => (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31 ? Number(s) : null);

/**
 * Turns the income form into rows: one per pay day each month. Day 31 means the last day of the month.
 * "twice" needs two different days (for example 15 and the last day).
 */
export function parseIncome(input: IncomeInput): { error: string } | { rows: IncomeRow[] } {
  const name = input.name.trim();
  if (!name) return { error: "Enter a name" };
  const amountCents = toCents(input.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter a dollar amount more than zero" };
  const schedule = input.schedule === "twice" ? "twice" : "monthly";
  const first = asDay(input.day);
  if (first == null) return { error: "Choose a pay day" };
  if (schedule === "monthly") return { rows: [{ name, amountCents, dayOfMonth: first }] };
  const second = asDay(input.day2);
  if (second == null) return { error: "Choose the second pay day" };
  if (second === first) return { error: "The two pay days must be different" };
  return {
    rows: [first, second].sort((a, b) => a - b).map((dayOfMonth) => ({ name, amountCents, dayOfMonth })),
  };
}
