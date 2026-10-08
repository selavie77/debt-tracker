import { shiftMonth } from "./calendar";
import { toCents } from "./money";

export type IncomeInput = {
  name: string;
  amount: string;
  schedule: string;
  day: string;
  day2: string;
  /** "steady" (a paycheck) or "variable" (a business forecast). Anything else counts as steady. */
  kind?: string;
  /** Business forecast: how much of the amount to count on, 1 to 100 (a trailing % is fine). */
  confidence?: string;
  /** Business forecast: the first month it applies to, YYYY-MM. */
  start?: string;
  /** Business forecast: how many months it applies for ("3", "6", "12", "24", "36"), or "ongoing". */
  duration?: string;
  /** Business forecast: the business entity it comes from (optional). */
  entityId?: string;
};

export type IncomeRow = {
  name: string;
  amountCents: number;
  dayOfMonth: number;
  kind: "steady" | "variable";
  entityId: string | null;
  confidencePercent: number | null;
  startsOn: string | null;
  endsOn: string | null;
};

export const DURATIONS = ["3", "6", "12", "24", "36", "ongoing"] as const;

const LAST_DAY = 31;
const asDay = (s: string): number | null => (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31 ? Number(s) : null);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/**
 * Turns the income form into rows.
 * - Paycheck: one row per pay day each month. Day 31 means the last day of the month. "twice" needs two different days.
 * - Business forecast: one row with the monthly amount if things go well, a confidence level, the first month it
 *   applies to and how long it lasts. It has no pay day.
 */
export function parseIncome(input: IncomeInput): { error: string } | { rows: IncomeRow[] } {
  const name = input.name.trim();
  if (!name) return { error: "Enter a name" };
  const amountCents = toCents(input.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter a dollar amount more than zero" };

  if (input.kind === "variable") {
    const raw = (input.confidence ?? "").trim().replace(/%$/, "");
    const confidence = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 100) return { error: "Enter your confidence as a number from 1 to 100" };
    const start = (input.start ?? "").trim();
    if (!MONTH.test(start)) return { error: "Choose the first month it applies to" };
    const duration = (input.duration ?? "").trim();
    if (!DURATIONS.includes(duration as (typeof DURATIONS)[number])) return { error: "Choose how long it applies for" };
    const endsOn = duration === "ongoing" ? null : lastDayOf(shiftMonth(start, Number(duration) - 1));
    return {
      rows: [{
        name, amountCents, dayOfMonth: LAST_DAY, kind: "variable", entityId: (input.entityId ?? "").trim() || null,
        confidencePercent: confidence, startsOn: `${start}-01`, endsOn,
      }],
    };
  }

  const steadyBase = { kind: "steady" as const, entityId: null, confidencePercent: null, startsOn: null, endsOn: null };
  const schedule = input.schedule === "twice" ? "twice" : "monthly";
  const first = asDay(input.day);
  if (first == null) return { error: "Choose a pay day" };
  if (schedule === "monthly") return { rows: [{ name, amountCents, dayOfMonth: first, ...steadyBase }] };
  const second = asDay(input.day2);
  if (second == null) return { error: "Choose the second pay day" };
  if (second === first) return { error: "The two pay days must be different" };
  return { rows: [first, second].sort((a, b) => a - b).map((dayOfMonth) => ({ name, amountCents, dayOfMonth, ...steadyBase })) };
}
