import type { DebtFull } from "./queries";
import { settlementSchedule } from "./finance";

// Tracks which settled debts may have tax consequences so they are not forgotten.
// This is a reminder list, not tax advice. Rules differ by debt type, entity, state and the
// taxpayer's circumstances (for example insolvency), so a tax professional should review each one.

/** Creditors generally must report canceled debt of this much or more (Form 1099-C). */
export const FORM_THRESHOLD_CENTS = 60_000;

export type TaxFlag = {
  debtId: string;
  name: string;
  entityName: string;
  kind: "cancellation" | "tax_debt";
  forgivenCents: number;
  agreedOn: string;
  finalPaymentOn: string;
  year: number; // year of the final payment, when the debt is most likely discharged
  paidOff: boolean;
  mayGetForm: boolean;
};

export function taxFlags(debts: DebtFull[]): TaxFlag[] {
  const out: TaxFlag[] = [];
  for (const d of debts) {
    if (!d.settlement || d.eliminated <= 0) continue;
    const sched = settlementSchedule(d.settlement);
    const lastScheduled = sched[sched.length - 1]?.date ?? d.settlement.firstPaymentOn;
    const paidOff = d.owed <= 0;
    const lastPaid = d.payments.length ? d.payments[d.payments.length - 1].paidOn : lastScheduled;
    const finalPaymentOn = paidOff ? lastPaid : lastScheduled;
    const isTax = d.debt.type === "federal_tax" || d.debt.type === "state_tax";
    out.push({
      debtId: d.debt.id,
      name: d.debt.name,
      entityName: d.entity.name,
      kind: isTax ? "tax_debt" : "cancellation",
      forgivenCents: d.eliminated,
      agreedOn: d.settlement.agreedOn,
      finalPaymentOn,
      year: Number(finalPaymentOn.slice(0, 4)),
      paidOff,
      mayGetForm: !isTax && d.eliminated >= FORM_THRESHOLD_CENTS,
    });
  }
  return out.sort((a, b) => (a.finalPaymentOn < b.finalPaymentOn ? -1 : 1));
}

export function totalsByYear(flags: TaxFlag[]): { year: number; forgivenCents: number; count: number }[] {
  const map = new Map<number, { year: number; forgivenCents: number; count: number }>();
  for (const f of flags) {
    if (f.kind !== "cancellation") continue;
    const row = map.get(f.year) ?? { year: f.year, forgivenCents: 0, count: 0 };
    row.forgivenCents += f.forgivenCents;
    row.count += 1;
    map.set(f.year, row);
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

/** How many flagged debts still need attention (not reviewed with a professional). */
export function pendingTaxCount(flags: TaxFlag[], reviewed: Set<string>): number {
  return flags.filter((f) => !reviewed.has(f.debtId)).length;
}
