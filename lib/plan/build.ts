import { CalBundle, monthEvents, monthTotals } from "../calendar";
import { daysBetween, todayISO } from "../dates";
import type { Entity, Income, Negotiation, Offer, PlannedEvent, Stage, TaxItem } from "../db/schema";
import { monthlyObligation, settlementSchedule } from "../finance";
import { isSupportDebtType, isTaxDebtType } from "../labels";
import { buildReminders, isTimeSensitive } from "../negotiation";
import type { DebtFull } from "../queries";
import { pendingTaxCount, taxFlags } from "../tax";
import { shiftMonth } from "./events";
import { buildStory, consequenceTier, didYouKnow, nextSteps, priorities, type Fact, type NextStep, type PriorityItem } from "./guidance";
import {
  breakEvenFromVariable, cashRunsOut, expectedOf, incomeForView, incomeScenarios, outlook, parseView, surplusByView,
  type IncomeScenarios, type IncomeView, type OutlookMonth, type SurplusByView,
} from "./income";
import { suggestPayoffs, type PayoffCandidate } from "./payoff";
import { compareExtra, type SimDebt } from "./simulate";

export type PlanEvent = Pick<PlannedEvent, "id" | "name" | "direction" | "amountCents" | "expectedMonth" | "confidencePercent" | "note"> & { payoffDebtIds: string[] };

export type PlanInput = {
  debts: DebtFull[];
  negs: Negotiation[];
  offers: Offer[];
  income: Income[];
  taxRows: TaxItem[];
  events: PlanEvent[];
  entities: Entity[];
  livingCostsCents: number | null;
  cashOnHandCents: number | null;
  /** Which level of business income to count: "steady", "expected" or "full". Defaults to your own confidence. */
  view?: string;
  /** How many months the outlook covers. Defaults to 12. */
  months?: number;
  today?: string;
};

export type WhatIfDebt = { id: string; name: string; owedCents: number; isTax: boolean };

export type EventPlan = {
  id: string;
  name: string;
  direction: "in" | "out";
  amountCents: number;
  month: string; // YYYY-MM
  confidencePercent: number;
  expectedCents: number; // signed, at your confidence
  note: string;
  payoffs: { debtId: string; name: string; costCents: number }[];
  payoffTotalCents: number;
  proceedsAfterCents: number; // what is left of the event after paying those debts off
  monthlyFreedCents: number; // debt payments that stop
  interestPerYearSavedCents: number;
  monthlyLeftBefore: number | null; // the month after, with those debts still being paid
  monthlyLeftAfter: number | null; // and with them gone
  suggestion: { names: string[]; usedCents: number; leftCents: number; interestPerYearSavedCents: number; monthlyFreedCents: number } | null;
};

export type ForecastRow = {
  id: string;
  name: string;
  entityName: string | null;
  amountCents: number;
  confidencePercent: number;
  expectedCents: number;
  startsOn: string | null;
  endsOn: string | null;
};

export type Plan = {
  openCount: number;
  owedCents: number;
  monthlyObligationCents: number;
  monthlyIncomeCents: number | null;
  livingCostsCents: number | null;
  cashOnHandCents: number | null;
  surplusCents: number | null;
  scenarios: IncomeScenarios;
  view: IncomeView;
  surplusByView: SurplusByView;
  breakEvenCents: number | null; // what the business must bring in monthly, with paychecks alone
  forecasts: ForecastRow[];
  outlook: OutlookMonth[];
  outlookMonths: number;
  runsOutMonth: string | null; // first month cash goes below zero in the chosen view
  eventPlans: EventPlan[];
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
  const thisMonth = today.slice(0, 7);
  const { debts } = i;
  const open = debts.filter((d) => d.owed > 0 && d.debt.status !== "paid");
  const byId = new Map(debts.map((d) => [d.debt.id, d]));
  const bundles: CalBundle[] = debts.map((d) => ({ ...d, id: d.debt.id, name: d.debt.name }));

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

  // Income, by view.
  const scenarios = incomeScenarios(i.income, thisMonth);
  const view = parseView(i.view, scenarios);
  const monthlyIncomeCents = i.income.length ? incomeForView(scenarios, view) : null;
  const byView = surplusByView(scenarios, i.livingCostsCents, monthlyObligationCents);
  const surplusCents = monthlyIncomeCents != null ? byView[view] : null;
  const breakEvenCents = scenarios.hasVariable ? breakEvenFromVariable(scenarios, i.livingCostsCents, monthlyObligationCents) : null;
  const entityName = new Map(i.entities.map((e) => [e.id, e.name]));
  const forecasts: ForecastRow[] = i.income
    .filter((r) => r.kind === "variable")
    .map((r) => ({
      id: r.id, name: r.name, entityName: r.entityId ? entityName.get(r.entityId) ?? null : null, amountCents: r.amountCents,
      confidencePercent: r.confidencePercent ?? 100, expectedCents: expectedOf(r), startsOn: r.startsOn, endsOn: r.endsOn,
    }));

  // What payoffs cost, and what is paid each month, in any future month.
  const none: ReadonlySet<string> = new Set();
  const obligationsFor = (month: string, paidOff: ReadonlySet<string>) =>
    bundles.filter((b) => !paidOff.has(b.id)).reduce((t, b) => {
      const tot = monthTotals(monthEvents([b], [], month, today));
      return t + tot.paid + tot.toPay;
    }, 0);
  const payoffCostFor = (debtId: string, month: string) => {
    const d = byId.get(debtId);
    if (!d) return 0;
    let cost = d.owed;
    // A settled debt keeps being paid on schedule until then, so less is owed by the time it is paid off.
    if (d.settlement) {
      const before = `${month}-01`;
      const scheduled = settlementSchedule(d.settlement).filter((r) => r.date >= today && r.date < before).reduce((t, r) => t + r.amountCents, 0);
      cost = Math.max(0, d.owed - scheduled);
    }
    return cost;
  };

  // Outlook.
  const months = Math.min(60, Math.max(1, i.months ?? 12));
  const eventLikes = i.events.map((e) => ({ ...e }));
  const out = i.livingCostsCents == null
    ? []
    : outlook({ rows: i.income, events: eventLikes, startMonth: thisMonth, months, livingCents: i.livingCostsCents, cashCents: i.cashOnHandCents ?? 0, obligationsFor, payoffCostFor });
  const runsOutMonth = out.length ? cashRunsOut(out, view) : null;

  // What each expected event would do.
  const candidates = (excluded: Set<string>): PayoffCandidate[] =>
    open
      .filter((d) => !excluded.has(d.debt.id))
      .map((d) => ({
        id: d.debt.id, name: d.debt.name, owedCents: d.owed, rateBps: d.debt.rateBps, monthlyCents: monthlyObligation(d, today),
        tier: consequenceTier(d.debt), settled: Boolean(d.settlement),
      }));
  const eventPlans: EventPlan[] = [...i.events]
    .sort((a, b) => (a.expectedMonth < b.expectedMonth ? -1 : 1))
    .map((e) => {
      const month = e.expectedMonth.slice(0, 7);
      const payoffs = e.direction === "in"
        ? e.payoffDebtIds.filter((id) => byId.has(id)).map((id) => ({ debtId: id, name: byId.get(id)!.debt.name, costCents: payoffCostFor(id, month) }))
        : [];
      const payoffTotalCents = payoffs.reduce((t, p) => t + p.costCents, 0);
      const ids = new Set(payoffs.map((p) => p.debtId));
      const freed = payoffs.reduce((t, p) => t + monthlyObligation(byId.get(p.debtId)!, today), 0);
      const saved = payoffs.reduce((t, p) => {
        const d = byId.get(p.debtId)!;
        return t + (d.settlement || d.debt.rateBps == null ? 0 : Math.round((d.owed * d.debt.rateBps) / 10000));
      }, 0);
      const after = shiftMonth(month, 1);
      const incomeAfter = incomeForView(incomeScenarios(i.income, after), view);
      const leftWith = (paid: ReadonlySet<string>) => (i.livingCostsCents == null ? null : incomeAfter - i.livingCostsCents - obligationsFor(after, paid));
      const proceedsAfterCents = e.amountCents - payoffTotalCents;
      const suggest = e.direction === "in" && payoffs.length > 0 && proceedsAfterCents > 0 ? suggestPayoffs(candidates(ids), proceedsAfterCents, "rate") : null;
      return {
        id: e.id, name: e.name, direction: e.direction, amountCents: e.amountCents, month, confidencePercent: e.confidencePercent,
        expectedCents: e.direction === "in" ? Math.round((e.amountCents * e.confidencePercent) / 100) : -Math.round((e.amountCents * e.confidencePercent) / 100),
        note: e.note, payoffs, payoffTotalCents, proceedsAfterCents, monthlyFreedCents: freed, interestPerYearSavedCents: saved,
        monthlyLeftBefore: payoffs.length ? leftWith(none) : null, monthlyLeftAfter: payoffs.length ? leftWith(ids) : null,
        suggestion: suggest && suggest.ids.length
          ? { names: suggest.ids.map((id) => byId.get(id)!.debt.name), usedCents: suggest.usedCents, leftCents: suggest.leftCents, interestPerYearSavedCents: suggest.interestPerYearSavedCents, monthlyFreedCents: suggest.monthlyFreedCents }
          : null,
      };
    });

  // Simulator inputs.
  const simDebts: SimDebt[] = [];
  const excluded: { name: string; reason: string }[] = [];
  for (const d of open) {
    if (d.settlement) {
      simDebts.push({ id: d.debt.id, name: d.debt.name, balanceCents: d.owed, aprBps: 0, minPaymentCents: Math.min(d.settlement.installmentCents, d.owed), fixed: true });
    } else if ((d.debt.rateBps != null || isSupportDebtType(d.debt.type)) && d.debt.monthlyPaymentCents) {
      // Support arrears usually carry no rate, so a missing rate counts as 0% for them.
      simDebts.push({ id: d.debt.id, name: d.debt.name, balanceCents: d.owed, aprBps: d.debt.rateBps ?? 0, minPaymentCents: d.debt.monthlyPaymentCents });
    } else {
      excluded.push({
        name: d.debt.name,
        reason: isTaxDebtType(d.debt.type)
          ? "back taxes with no payment plan entered"
          : d.debt.rateBps == null && !isSupportDebtType(d.debt.type)
            ? "no interest rate entered"
            : "no monthly payment entered",
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
    scenario: scenarios.hasVariable
      ? { view, expectedCents: scenarios.expectedCents, fullCents: scenarios.fullCents, steadySurplus: byView.steady, expectedSurplus: byView.expected, fullSurplus: byView.full, breakEvenCents }
      : undefined,
    outlook: out.length ? { months, runsOutMonth, cashStartCents: i.cashOnHandCents ?? 0, view } : undefined,
    events: eventPlans.filter((e) => e.payoffs.length > 0).map((e) => ({
      name: e.name, month: e.month, amountCents: e.amountCents, payoffNames: e.payoffs.map((p) => p.name), payoffTotalCents: e.payoffTotalCents,
      proceedsAfterCents: e.proceedsAfterCents, monthlyFreedCents: e.monthlyFreedCents,
    })),
  });

  return {
    openCount: open.length,
    owedCents,
    monthlyObligationCents,
    monthlyIncomeCents,
    livingCostsCents: i.livingCostsCents,
    cashOnHandCents: i.cashOnHandCents,
    surplusCents,
    scenarios,
    view,
    surplusByView: byView,
    breakEvenCents,
    forecasts,
    outlook: out,
    outlookMonths: months,
    runsOutMonth,
    eventPlans,
    story,
    steps: nextSteps({
      debts, stageByDebt, nextActionByDebt, reminders, incomeCount: i.income.length, livingCostsCents: i.livingCostsCents, surplusCents, taxPending, breakEvenCents,
      runsOutMonth, view, payoffEvents: eventPlans.filter((e) => e.payoffs.length > 0 && e.month >= thisMonth).map((e) => ({ name: e.name, month: e.month, debtNames: e.payoffs.map((p) => p.name) })), today,
    }),
    order: priorities(debts, stageByDebt, today),
    facts: didYouKnow(debts, today, {
      businessIncomeNames: i.income.filter((r) => r.kind === "variable").map((r) => r.name),
      payoffEvents: eventPlans
        .filter((e) => e.payoffs.length > 0 && e.month >= thisMonth)
        .map((e) => ({ name: e.name, hasTaxDebt: e.payoffs.some((p) => isTaxDebtType(byId.get(p.debtId)!.debt.type)) })),
    }),
    simDebts,
    excluded,
    whatIf: open
      .filter((d) => !d.settlement)
      .sort((a, b) => b.owed - a.owed)
      .map((d) => ({ id: d.debt.id, name: d.debt.name, owedCents: d.owed, isTax: isTaxDebtType(d.debt.type) })),
    defaultExtraCents,
  };
}
