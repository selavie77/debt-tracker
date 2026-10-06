import { toCsv } from "./csv";
import type { Payment } from "./db/schema";
import { monthlyObligation } from "./finance";
import type { DebtFull } from "./queries";
import { todayISO } from "./dates";

export type Totals = {
  count: number;
  originalCents: number;
  owedCents: number;
  eliminatedCents: number;
  paidCents: number;
  monthlyCents: number;
  guaranteedOwedCents: number; // owed on debts with a personal guarantee
};

export function totals(debts: DebtFull[], today = todayISO()): Totals {
  const sum = (f: (d: DebtFull) => number) => debts.reduce((s, d) => s + f(d), 0);
  return {
    count: debts.length,
    originalCents: sum((d) => d.debt.originalCents),
    owedCents: sum((d) => d.owed),
    eliminatedCents: sum((d) => d.eliminated),
    paidCents: sum((d) => d.paid),
    monthlyCents: sum((d) => monthlyObligation(d, today)),
    guaranteedOwedCents: sum((d) => (d.debt.personalGuarantee ? d.owed : 0)),
  };
}

export function groupTotals(debts: DebtFull[], key: (d: DebtFull) => string, today = todayISO()): { key: string; totals: Totals }[] {
  const groups = new Map<string, DebtFull[]>();
  for (const d of debts) groups.set(key(d), [...(groups.get(key(d)) ?? []), d]);
  return [...groups.entries()].map(([k, list]) => ({ key: k, totals: totals(list, today) })).sort((a, b) => b.totals.owedCents - a.totals.owedCents);
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Same columns as the Import page, so an export can be re-imported. */
export function debtsCsv(debts: DebtFull[]): string {
  const head = ["entity", "name", "creditor", "type", "original", "rate", "status", "monthly", "payment_day", "collateral", "government", "personal_guarantee"];
  return toCsv([
    head,
    ...debts.map((d) => [
      d.entity.name,
      d.debt.name,
      d.debt.creditor,
      d.debt.type,
      dollars(d.debt.originalCents),
      d.debt.rateBps == null ? "" : String(d.debt.rateBps / 100),
      d.debt.status,
      d.debt.monthlyPaymentCents == null ? "" : dollars(d.debt.monthlyPaymentCents),
      d.debt.paymentDay,
      d.debt.collateral,
      d.debt.government ? "yes" : "no",
      d.debt.personalGuarantee ? "yes" : "no",
    ]),
  ]);
}

/** Same columns as the payments import. */
export function paymentsCsv(debts: DebtFull[]): string {
  const rows = debts.flatMap((d) =>
    (d.payments as Payment[]).map((p) => [d.debt.name, p.paidOn, dollars(p.amountCents), p.interestCents ? dollars(p.interestCents) : "", p.note]),
  );
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return toCsv([["debt", "date", "amount", "interest", "note"], ...rows]);
}

export function settlementsCsv(debts: DebtFull[]): string {
  const rows = debts
    .filter((d) => d.settlement)
    .map((d) => {
      const s = d.settlement!;
      return [d.entity.name, d.debt.name, dollars(d.debt.originalCents), dollars(s.agreedCents), dollars(d.eliminated), s.installments, dollars(s.installmentCents), s.agreedOn, s.firstPaymentOn, dollars(d.paid), dollars(d.owed)];
    });
  return toCsv([["entity", "debt", "original", "agreed", "eliminated", "payments", "installment", "agreed_on", "first_payment", "paid", "owed"], ...rows]);
}
