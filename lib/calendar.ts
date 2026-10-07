import { balanceAt, settlementSchedule, type DebtBundle } from "./finance";

export type CalBundle = DebtBundle & { id: string; name: string };
export type IncomeLike = { name: string; amountCents: number; dayOfMonth: number };
export type CalEvent = {
  date: string;
  kind: "income" | "paid" | "due" | "late";
  label: string;
  amountCents: number;
  debtId?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Stored as 31 and clamped to the month's real length, so it lands on the 28th, 29th, 30th or 31st. */
export const LAST_DAY_OF_MONTH = 31;

/** "the 15th", "the last day of the month". */
export function dayOfMonthLabel(day: number): string {
  if (day >= LAST_DAY_OF_MONTH) return "the last day of the month";
  const mod100 = day % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `the ${day}${suffix}`;
}

/** Everything that happens in one month: income, payments already made, and payments still to come or overdue. */
export function monthEvents(bundles: CalBundle[], income: IncomeLike[], month: string, today: string): CalEvent[] {
  const events: CalEvent[] = [];
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const thisMonth = today.slice(0, 7);

  for (const i of income) {
    events.push({ date: `${month}-${pad(Math.min(i.dayOfMonth, lastDay))}`, kind: "income", label: i.name, amountCents: i.amountCents });
  }

  for (const b of bundles) {
    for (const p of b.payments) {
      if (p.paidOn.slice(0, 7) === month) events.push({ date: p.paidOn, kind: "paid", label: b.name, amountCents: p.amountCents, debtId: b.id });
    }
    const owed = balanceAt(b, today);
    if (owed <= 0) continue;

    if (b.settlement) {
      const s = b.settlement;
      const paidCount = b.payments.filter((p) => p.paidOn >= s.agreedOn).length;
      settlementSchedule(s).forEach((row, idx) => {
        if (idx >= paidCount && row.date.slice(0, 7) === month) {
          events.push({ date: row.date, kind: row.date < today ? "late" : "due", label: b.name, amountCents: row.amountCents, debtId: b.id });
        }
      });
    } else if (b.debt.monthlyPaymentCents && b.debt.paymentDay && (b.debt.status === "active" || b.debt.status === "kept") && month >= thisMonth) {
      const paidThisMonth = b.payments.some((p) => p.paidOn.slice(0, 7) === month);
      if (!paidThisMonth) {
        const date = `${month}-${pad(b.debt.paymentDay)}`;
        events.push({ date, kind: date < today ? "late" : "due", label: b.name, amountCents: Math.min(b.debt.monthlyPaymentCents, owed), debtId: b.id });
      }
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));
}

export function monthTotals(events: CalEvent[]) {
  const sum = (k: CalEvent["kind"][]) => events.filter((e) => k.includes(e.kind)).reduce((s, e) => s + e.amountCents, 0);
  const income = sum(["income"]);
  const paid = sum(["paid"]);
  const toPay = sum(["due", "late"]);
  return { income, paid, toPay, leftAfter: income - paid - toPay };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
