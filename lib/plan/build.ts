import { daysBetween, todayISO } from "../dates";
import type { Income, Negotiation, Offer, Stage, TaxItem } from "../db/schema";
import { monthlyObligation } from "../finance";
import { isTaxDebtType } from "../labels";
import { buildReminders, isTimeSensitive } from "../negotiation";
import type { DebtFull } from "../queries";
import { pendingTaxCount, taxFlags } from "../tax";
import { buildStory, didYouKnow, nextSteps, priorities, type Fact, type NextStep, type PriorityItem } from "./guidance";
import { compareExtra, type SimDebt } from "./simulate";

export type PlanInput = {
  debts: DebtFull[];
  negs: Negotiation[];
  offers: Offer[];
  income: Income[];
  taxRows: TaxItem[];
  livingCostsCents: number | null;
  today?: string;
};

export type WhatIfDebt = { id: string; name: string; owedCents: number; isTax: boolean };

export type Plan = {
  openCount: number;
  owedCents: number;
  monthlyObligationCents: number;
  monthlyIncomeCents: number | null;
  livingCostsCents: number | null;
  surplusCents: number | null;
  story: string[];
  steps: NextStep[];
  order: PriorityItem[];
  facts: Fact[];
  simDebts: SimDebt[];
  excluded: { name: string; reason: string }[];
  whatIf: WhatIfDebt[];
  defaultExtraCents: number;
};

/** Everything the Plan page shows, from the user's data. Pure, so it can be tested without a database. */
export function buildPlan(i: PlanInput): Plan {
  const today = i.today ?? todayISO();
  const { debts } = i;
  const open = debts.filter((d) => d.owed > 0 && d.debt.status !== "paid");

  const stageByDebt = new Map<string, Stage>(i.negs.map((n) => [n.debtId, n.stage]));
  const nextActionByDebt = new Map(i.negs.map((n) => [n.debtId, n.nextActionOn]));
  const reminders = buildReminders(
    debts.map((d) => ({ id: d.debt.id, name: d.debt.name, status: d.debt.status, owedCents: d.owed, delinquentSince: d.debt.delinquentSince })),
    i.negs,
    i.offers,
    today,
  );

  const owedCents = open.reduce((s, d) => s + d.owed, 0);
  const originalCents = debts.reduce((s, d) => s + d.debt.originalCents, 0);
  const monthlyObligationCents = debts.reduce((s, d) => s + monthlyObligation(d, today), 0);
  const monthlyIncomeCents = i.income.length ? i.income.reduce((s, r) => s + r.amountCents, 0) : null;
  const surplusCents = monthlyIncomeCents != null && i.livingCostsCents != null ? monthlyIncomeCents - i.livingCostsCents - monthlyObligationCents : null;

  const simDebts: SimDebt[] = [];
  const excluded: { name: string; reason: string }[] = [];
  for (const d of open) {
    if (d.settlement) {
      simDebts.push({ id: d.debt.id, name: d.debt.name, balanceCents: d.owed, aprBps: 0, minPaymentCents: Math.min(d.settlement.installmentCents, d.owed), fixed: true });
    } else if (d.debt.rateBps != null && d.debt.monthlyPaymentCents) {
      simDebts.push({ id: d.debt.id, name: d.debt.name, balanceCents: d.owed, aprBps: d.debt.rateBps, minPaymentCents: d.debt.monthlyPaymentCents });
    } else {
      excluded.push({
        name: d.debt.name,
        reason: isTaxDebtType(d.debt.type) ? "back taxes with no payment plan entered" : d.debt.rateBps == null ? "no interest rate entered" : "no monthly payment entered",
      });
    }
  }
  const variable = simDebts.filter((d) => !d.fixed);
  const defaultExtraCents = surplusCents != null && surplusCents >= 5_000 ? Math.floor(surplusCents / 5_000) * 5_000 : 10_000;

  const withRate = open.filter((d) => !d.settlement && d.debt.rateBps != null && d.debt.rateBps > 0);
  const costliest = [...withRate].sort((a, b) => b.owed * b.debt.rateBps! - a.owed * a.debt.rateBps!)[0];
  const topRate = [...variable].sort((a, b) => b.aprBps - a.aprBps)[0];
  const headline = surplusCents != null && surplusCents >= 5_000 && topRate ? compareExtra(simDebts, defaultExtraCents, "avalanche") : null;

  const reviewed = new Set(i.taxRows.filter((t) => t.reviewedWithPro).map((t) => t.debtId));
  const taxPending = pendingTaxCount(taxFlags(debts), reviewed);

  const story = buildStory({
    openCount: open.length,
    owedCents,
    originalCents,
    goneCents: Math.max(0, originalCents - debts.reduce((s, d) => s + d.owed, 0)),
    monthlyObligationCents,
    monthlyIncomeCents,
    livingCostsCents: i.livingCostsCents,
    costliest: costliest
      ? { name: costliest.debt.name, rateBps: costliest.debt.rateBps!, interestPerYearCents: Math.round((costliest.owed * costliest.debt.rateBps!) / 10000) }
      : null,
    lateCount: open.filter((d) => d.debt.delinquentSince && daysBetween(d.debt.delinquentSince, today) > 0).length,
    urgentCount: reminders.filter(isTimeSensitive).length,
    extra: headline && topRate ? { extraCents: defaultExtraCents, targetName: topRate.name, monthsSaved: headline.monthsSaved, interestSavedCents: headline.interestSavedCents } : null,
  });

  return {
    openCount: open.length,
    owedCents,
    monthlyObligationCents,
    monthlyIncomeCents,
    livingCostsCents: i.livingCostsCents,
    surplusCents,
    story,
    steps: nextSteps({ debts, stageByDebt, nextActionByDebt, reminders, incomeCount: i.income.length, livingCostsCents: i.livingCostsCents, surplusCents, taxPending, today }),
    order: priorities(debts, stageByDebt, today),
    facts: didYouKnow(debts, today),
    simDebts,
    excluded,
    whatIf: open
      .filter((d) => !d.settlement)
      .sort((a, b) => b.owed - a.owed)
      .map((d) => ({ id: d.debt.id, name: d.debt.name, owedCents: d.owed, isTax: isTaxDebtType(d.debt.type) })),
    defaultExtraCents,
  };
}
