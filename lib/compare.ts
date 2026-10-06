import { daysBetween, todayISO } from "./dates";
import { amortize } from "./finance";
import { TYPE_LABEL } from "./labels";
import { usdWhole } from "./money";
import type { DebtFull } from "./queries";

// Side-by-side facts about each debt. It reports numbers and things worth checking.
// It never recommends an action.

export type CompareColumn = {
  id: string;
  name: string;
  owedCents: number;
  rateBps: number | null;
  interestPerYearCents: number | null; // interest at the current balance, when no settlement is in place
  payoffMonths: number | null; // at the regular monthly payment, when a rate and payment are set
  totalInterestCents: number | null;
  government: boolean;
  collateral: string;
  guarantee: boolean;
  daysLate: number;
  monthlyCents: number;
  settlementAgreedCents: number | null;
  stage: string | null;
  checks: string[];
};

export function compareColumn(d: DebtFull, stage: string | null, today = todayISO()): CompareColumn {
  const { debt, settlement } = d;
  const rate = debt.rateBps;
  const interestPerYear = !settlement && rate != null && d.owed > 0 ? Math.round((d.owed * rate) / 10000) : null;
  const monthly = settlement ? settlement.installmentCents : (debt.monthlyPaymentCents ?? 0);
  let payoffMonths: number | null = null;
  let totalInterest: number | null = null;
  if (!settlement && rate != null && debt.monthlyPaymentCents && d.owed > 0) {
    const a = amortize({ balanceCents: d.owed, aprBps: rate, paymentCents: debt.monthlyPaymentCents, startDate: today });
    if (!a.payoffNever) {
      payoffMonths = a.rows.length;
      totalInterest = a.totalInterestCents;
    }
  }
  const daysLate = debt.delinquentSince && d.owed > 0 ? Math.max(0, daysBetween(debt.delinquentSince, today)) : 0;

  const checks: string[] = [];
  if (debt.type === "federal_tax" || debt.type === "state_tax") {
    checks.push("Tax debts have their own payment and compromise rules. Read the agency's official guidance.");
  }
  if (debt.government) {
    checks.push("Government-backed debt often has official hardship or modification programs with eligibility rules. Check the agency's own site.");
  }
  if (debt.collateral) {
    checks.push(`Secured by ${debt.collateral}. Read the contract for lien, repossession and default terms.`);
  }
  if (debt.personalGuarantee) {
    checks.push("A personal guarantee can make you personally liable if the business does not pay.");
  }
  if (daysLate >= 90) {
    checks.push(`${daysLate} days late. Check whether that changes the options this creditor or program offers.`);
  }
  if (interestPerYear != null && rate != null && rate >= 1500) {
    checks.push(`High rate: about ${usdWhole(interestPerYear)} a year in interest at the current balance.`);
  }
  if (rate != null && rate > 0 && rate <= 500 && !settlement) {
    checks.push("Low rate. Check what it would cost to replace this financing before changing how you handle it.");
  }
  if (settlement) {
    checks.push("Settlement in place. Keep the written agreement and every payment receipt.");
  }
  if (debt.type === "credit_card" || debt.type === "business_loan") {
    checks.push("Ask for any settlement terms in writing before paying.");
  }

  return {
    id: debt.id,
    name: debt.name,
    owedCents: d.owed,
    rateBps: rate,
    interestPerYearCents: interestPerYear,
    payoffMonths,
    totalInterestCents: totalInterest,
    government: debt.government,
    collateral: debt.collateral,
    guarantee: debt.personalGuarantee,
    daysLate,
    monthlyCents: monthly,
    settlementAgreedCents: settlement?.agreedCents ?? null,
    stage,
    checks,
  };
}

export function typeLabel(d: DebtFull): string {
  return TYPE_LABEL[d.debt.type];
}
