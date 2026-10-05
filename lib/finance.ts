import { addMonths } from "./dates";

// Pure money logic. No database access here so it can be tested on its own.

export type PaymentLike = { paidOn: string; amountCents: number; interestCents: number };
export type SettlementLike = {
  agreedCents: number;
  installmentCents: number;
  installments: number;
  agreedOn: string;
  firstPaymentOn: string;
};
export type DebtLike = {
  originalCents: number;
  rateBps: number | null;
  status: string;
  monthlyPaymentCents: number | null;
  paymentDay: number | null;
};
export type DebtBundle = { debt: DebtLike; settlement: SettlementLike | null; payments: PaymentLike[] };

const principal = (p: PaymentLike) => p.amountCents - p.interestCents;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Balance owed on a date.
 * - Before a settlement is agreed: original minus principal paid.
 * - After: the agreed amount minus payments made on or after the agreement date.
 */
export function balanceAt(b: DebtBundle, asOf: string): number {
  const pays = b.payments.filter((p) => p.paidOn <= asOf);
  const s = b.settlement;
  if (s && s.agreedOn <= asOf) {
    return Math.max(0, s.agreedCents - sum(pays.filter((p) => p.paidOn >= s.agreedOn).map((p) => p.amountCents)));
  }
  return Math.max(0, b.debt.originalCents - sum(pays.map(principal)));
}

/** Amount removed by the settlement (balance just before agreement minus agreed amount). */
export function eliminated(b: DebtBundle): number {
  const s = b.settlement;
  if (!s) return 0;
  const before = Math.max(
    0,
    b.debt.originalCents - sum(b.payments.filter((p) => p.paidOn < s.agreedOn).map(principal)),
  );
  return Math.max(0, before - s.agreedCents);
}

export function totalPaid(b: DebtBundle): number {
  return sum(b.payments.map((p) => p.amountCents));
}

/** Equal installments; the last one absorbs any rounding remainder. */
export function settlementSchedule(s: SettlementLike): { date: string; amountCents: number }[] {
  const out: { date: string; amountCents: number }[] = [];
  let left = s.agreedCents;
  for (let i = 0; i < s.installments; i++) {
    const amt = i === s.installments - 1 ? left : Math.min(s.installmentCents, left);
    out.push({ date: addMonths(s.firstPaymentOn, i), amountCents: amt });
    left -= amt;
  }
  return out;
}

/** Split a total agreed amount into an installment count and size. */
export function installmentFor(agreedCents: number, installments: number): number {
  return installments > 0 ? Math.round(agreedCents / installments) : agreedCents;
}

export type AmortRow = { date: string; paymentCents: number; interestCents: number; principalCents: number; balanceCents: number };

/** Standard monthly amortization. Stops at zero balance, or after maxMonths if the payment never covers interest. */
export function amortize(opts: {
  balanceCents: number;
  aprBps: number;
  paymentCents: number;
  startDate: string;
  maxMonths?: number;
}): { rows: AmortRow[]; payoffNever: boolean; totalInterestCents: number } {
  const monthlyRate = opts.aprBps / 10000 / 12;
  const maxMonths = opts.maxMonths ?? 600;
  const rows: AmortRow[] = [];
  let bal = opts.balanceCents;
  let totalInterest = 0;
  for (let i = 0; i < maxMonths && bal > 0; i++) {
    const interest = Math.round(bal * monthlyRate);
    if (opts.paymentCents <= interest && i === 0) {
      return { rows: [], payoffNever: true, totalInterestCents: 0 };
    }
    const pay = Math.min(opts.paymentCents, bal + interest);
    const princ = pay - interest;
    bal -= princ;
    totalInterest += interest;
    rows.push({ date: addMonths(opts.startDate, i), paymentCents: pay, interestCents: interest, principalCents: princ, balanceCents: bal });
  }
  return { rows, payoffNever: bal > 0, totalInterestCents: totalInterest };
}

/** Balance after each payment, starting from the opening balance. */
export function balanceSteps(b: DebtBundle): { date: string | null; balanceCents: number }[] {
  const dates = Array.from(new Set(b.payments.map((p) => p.paidOn))).sort();
  const first = b.settlement && b.settlement.agreedOn;
  const steps: { date: string | null; balanceCents: number }[] = [
    { date: null, balanceCents: first ? b.settlement!.agreedCents : b.debt.originalCents },
  ];
  for (const d of dates) steps.push({ date: d, balanceCents: balanceAt(b, d) });
  return steps;
}

/** Next scheduled payment on or after `today`, or null. */
export function nextDue(b: DebtBundle, today: string): { date: string; amountCents: number } | null {
  const bal = balanceAt(b, today);
  if (bal <= 0) return null;
  if (b.settlement) {
    const s = b.settlement;
    const paidCount = b.payments.filter((p) => p.paidOn >= s.agreedOn).length;
    const sched = settlementSchedule(s);
    const next = sched[paidCount];
    return next ? { date: next.date, amountCents: Math.min(next.amountCents, bal) } : null;
  }
  const { monthlyPaymentCents: amt, paymentDay: day } = b.debt;
  if (amt && day) {
    const [y, m, d] = today.split("-").map(Number);
    const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = d <= day ? thisMonth : addMonths(thisMonth, 1);
    return { date, amountCents: Math.min(amt, bal) };
  }
  return null;
}

/** Monthly obligation counted on the dashboard. */
export function monthlyObligation(b: DebtBundle, today: string): number {
  if (balanceAt(b, today) <= 0) return 0;
  if (b.settlement) return Math.min(b.settlement.installmentCents, balanceAt(b, today));
  if (b.debt.status === "active" || b.debt.status === "kept") return b.debt.monthlyPaymentCents ?? 0;
  return 0;
}

/** Total owed at the end of each month between `from` and `to`, across debts. */
export function monthlyTotals(bundles: DebtBundle[], from: string, to: string): { month: string; owedCents: number }[] {
  const out: { month: string; owedCents: number }[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    const last = new Date(y, m, 0).getDate();
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const asOf = key === to.slice(0, 7) ? to : `${key}-${String(last).padStart(2, "0")}`;
    out.push({ month: key, owedCents: sum(bundles.map((b) => balanceAt(b, asOf))) });
  }
  return out;
}
