import { daysBetween, todayISO } from "../dates";
import type { Debt, Stage } from "../db/schema";
import { TYPE_LABEL, isSupportDebtType, isTaxDebtType } from "../labels";
import { rateLabel, usdWhole } from "../money";
import { STAGE_LABEL, isTimeSensitive, type Reminder } from "../negotiation";
import type { DebtFull } from "../queries";
import { FORM_THRESHOLD_CENTS } from "../tax";
import type { IncomeView } from "./income";

// Rule-based guidance. Every sentence is built from fixed rules and the user's own numbers, so it can be tested
// and nothing is sent to an outside service. It lists facts, options to consider and questions to ask.
// It never tells anyone to stop paying, to ignore a creditor, or which option to pick.

export const DISCLAIMER =
  "General information from a record-keeping tool, not legal, tax or financial advice. Rules differ by state, creditor and situation. Talk to a licensed professional before you act.";

export type Tier = 1 | 2 | 3;

export const TIER_INFO: Record<Tier, { label: string; reason: string }> = {
  1: {
    label: "Strongest collection powers",
    reason: "Back taxes, past-due support, government-backed loans, and loans secured by a home or vehicle can usually be collected, or the collateral taken, without first winning a new court case.",
  },
  2: {
    label: "Secured or personally guaranteed",
    reason: "A lender may be able to take the collateral, or come after you personally under a guarantee, but usually has more steps to go through first.",
  },
  3: {
    label: "Unsecured",
    reason: "Credit cards and similar debts generally need a court judgment before wages or bank accounts can be taken, though rules vary by state.",
  },
};

/** A general pattern, not a legal ruling. Used only to order the list and explain why. */
export function consequenceTier(debt: Pick<Debt, "type" | "government" | "collateral" | "personalGuarantee">): Tier {
  if (isTaxDebtType(debt.type) || isSupportDebtType(debt.type) || debt.government || debt.type === "mortgage" || debt.type === "auto_loan") return 1;
  if (debt.collateral || debt.type === "secured" || debt.personalGuarantee) return 2;
  return 3;
}

export type PriorityItem = {
  debtId: string;
  name: string;
  typeLabel: string;
  tier: Tier;
  owedCents: number;
  daysLate: number;
  interestPerYearCents: number | null;
  stage: string | null;
  facts: string[];
  options: string[];
  questions: string[];
};

const isOpen = (d: DebtFull) => d.owed > 0 && d.debt.status !== "paid";

export function priorities(debts: DebtFull[], stageByDebt: Map<string, Stage>, today = todayISO()): PriorityItem[] {
  const items = debts.filter(isOpen).map((d): PriorityItem => {
    const { debt, settlement } = d;
    const tier = consequenceTier(debt);
    const daysLate = debt.delinquentSince ? Math.max(0, daysBetween(debt.delinquentSince, today)) : 0;
    const rate = debt.rateBps;
    const interestPerYear = !settlement && rate != null ? Math.round((d.owed * rate) / 10000) : null;
    const stage = stageByDebt.get(debt.id);
    const isTax = isTaxDebtType(debt.type);
    const isSupport = isSupportDebtType(debt.type);
    const secured = debt.type === "mortgage" || debt.type === "auto_loan" || debt.type === "secured" || Boolean(debt.collateral);

    const facts = [`${usdWhole(d.owed)} owed${rate != null && !settlement ? ` at ${rateLabel(rate)}` : ""}.`];
    if (interestPerYear != null && interestPerYear > 0) facts.push(`About ${usdWhole(interestPerYear)} a year in interest at this balance.`);
    if (daysLate > 0) facts.push(`${daysLate} days late.`);
    if (stage) facts.push(`Negotiation stage: ${STAGE_LABEL[stage]}.`);
    if (settlement) facts.push(`Settlement agreed at ${usdWhole(settlement.agreedCents)}.`);
    if (debt.personalGuarantee) facts.push("Personally guaranteed.");

    const options: string[] = [];
    if (settlement) {
      options.push("Keep to the agreed schedule.", "Keep the written agreement and a receipt for every payment.");
    } else {
      if (isSupport) {
        options.push(
          "Child support and alimony are court orders, so a change generally needs the court or the support agency to approve it.",
          "If your income or circumstances have changed, ask about modifying the order. A change usually applies only from the date you ask, not backward.",
          "Ask about a payment plan for the past-due amount.",
          "A family-law attorney, or a legal aid office, can explain what applies in your state.",
        );
      } else if (isTax) options.push("Look at the agency's payment plans and compromise programs, and what they require.", "Ask a tax professional what you may qualify for.");
      else if (debt.government) options.push("Check the agency's own hardship or modification programs and their eligibility rules.", "Ask what changes if you fall further behind.");
      else if (secured) options.push("Ask the lender about modification, deferral or refinancing, ideally before falling further behind.", "Read what your contract says happens after a default.");
      else if (daysLate > 0) options.push("Ask the creditor what hardship, payment-plan or settlement options exist.", "Get any agreement confirmed in writing before you pay.");
      else if (rate != null && rate >= 1500) options.push("Extra payments here save the most interest. The simulator below shows how much.");
      else options.push("Keep paying as scheduled.");
      if (debt.personalGuarantee) options.push("Ask how the personal guarantee affects your options.");
    }

    const questions = ["What is the exact payoff amount today, including interest and fees?"];
    if (isSupport) questions.push("What does the order require, and what past-due amount is on record?");
    if (!settlement) questions.push("What options exist for someone in my situation?");
    if (isTax) questions.push("What does the agency need from me to review a payment plan or compromise?");
    if (secured && !settlement) questions.push("What happens, step by step, if I miss another payment?");
    questions.push("Will you confirm any agreement in writing before I pay?");

    return { debtId: debt.id, name: debt.name, typeLabel: TYPE_LABEL[debt.type], tier, owedCents: d.owed, daysLate, interestPerYearCents: interestPerYear, stage: stage ? STAGE_LABEL[stage] : null, facts, options, questions };
  });

  return items.sort(
    (a, b) => a.tier - b.tier || b.daysLate - a.daysLate || (b.interestPerYearCents ?? 0) - (a.interestPerYearCents ?? 0) || b.owedCents - a.owedCents,
  );
}

// ---- "Did you know" ----

export type Fact = { id: string; title: string; text: string; about: string[] };

export function didYouKnow(debts: DebtFull[], today = todayISO(), opts: { businessIncomeNames?: string[]; payoffEvents?: { name: string; hasTaxDebt: boolean }[] } = {}): Fact[] {
  const open = debts.filter(isOpen);
  const names = (list: DebtFull[]) => list.map((d) => d.debt.name);
  const out: Fact[] = [];
  const add = (id: string, title: string, text: string, list: DebtFull[]) => {
    if (list.length) out.push({ id, title, text, about: names(list) });
  };

  if (opts.payoffEvents?.length) {
    out.push({
      id: "proceeds",
      title: "Sale proceeds can have taxes and costs",
      text: "If the money comes from selling something, closing costs and any tax on the gain come out of it. Use the amount you expect to actually receive. A tax professional can estimate any tax on the gain.",
      about: opts.payoffEvents.map((e) => e.name),
    });
    const withTax = opts.payoffEvents.filter((e) => e.hasTaxDebt);
    if (withTax.length) {
      out.push({
        id: "lien",
        title: "Back taxes can come out of a sale at closing",
        text: "A federal or state tax lien can attach to property you own, and an unpaid balance may have to be paid from the proceeds at closing. Ask the title or escrow company early for a payoff figure, and get written payoff letters from each creditor so nothing changes at the last minute.",
        about: withTax.map((e) => e.name),
      });
    }
  }
  if (opts.businessIncomeNames?.length) {
    out.push({
      id: "selfemployed",
      title: "Business income is usually taxable",
      text: "Money from a side business is usually taxable income. Self-employed people generally owe self-employment tax on top of income tax, and make quarterly estimated payments when they expect to owe $1,000 or more. Setting aside a share of each month's earnings can keep a new tax bill from building up. A tax professional can tell you how much.",
      about: opts.businessIncomeNames,
    });
  }

  add("irs", "Back taxes have their own payment options",
    "The IRS offers payment plans and, in some cases, an Offer in Compromise to settle for less than the full amount. Penalties and interest keep adding up until the balance is paid. A tax professional can tell you what you may qualify for.",
    open.filter((d) => d.debt.type === "federal_tax"));
  add("state", "States have payment options too",
    "Many states offer payment plans, and some offer compromise programs. Rules and eligibility differ by state, so check your state tax department.",
    open.filter((d) => d.debt.type === "state_tax" || d.debt.type === "other_tax"));
  add("support", "Support orders are enforced differently",
    "Child support and alimony are court orders. States can collect past-due support through wage withholding, tax refund interception and license suspension, and it is generally not erased by bankruptcy. Changes usually have to be approved by the court or support agency and typically apply only going forward, so it helps to ask about a modification early if your income has dropped.",
    open.filter((d) => isSupportDebtType(d.debt.type)));
  add("payroll", "Unpaid payroll taxes can be personal",
    "Unpaid payroll taxes can make the people responsible for them personally liable, not just the business. Ask a tax professional how this applies to you.",
    open.filter((d) => d.debt.type === "other_tax"));
  add("government", "Government loans often have hardship programs",
    "Government-backed loans often have their own hardship or modification programs. Being far behind can limit which ones you can use, so check the current rules sooner rather than later.",
    open.filter((d) => d.debt.government && !isTaxDebtType(d.debt.type)));
  add("secured", "Lenders are often more flexible before a default",
    "Lenders are often more willing to change the terms of a secured loan before you fall behind than after. Your contract and state law say what can happen after a default.",
    open.filter((d) => d.debt.type === "mortgage" || d.debt.type === "auto_loan" || d.debt.type === "secured" || Boolean(d.debt.collateral)));
  add("guarantee", "A guarantee makes a business debt personal",
    "A personal guarantee can make you personally responsible for a business debt, even if the business closes.",
    open.filter((d) => d.debt.personalGuarantee));

  const lateUnsecured = open.filter((d) => consequenceTier(d.debt) === 3 && d.debt.delinquentSince && daysBetween(d.debt.delinquentSince, today) > 0);
  add("limit", "Old debts have a time limit",
    "The time limit for a lender to sue over a debt (the statute of limitations) varies by state and type of debt. In some states, a partial payment or written acknowledgment can restart it. Ask a lawyer before paying on an old debt.",
    lateUnsecured);
  add("collectors", "Collectors must follow federal rules",
    "Debt collectors generally cannot call before 8 a.m. or after 9 p.m., and you can ask in writing for proof that the debt is yours. You can also tell them in writing to stop contacting you, though the debt itself stays.",
    lateUnsecured);
  add("writing", "Get every agreement in writing",
    "Get any settlement or payment agreement in writing before you pay, keep proof of every payment, and ask how the account will be reported afterward.",
    open.filter((d) => d.settlement || d.debt.status === "negotiating"));
  add("forgiven", "Forgiven debt can be taxable",
    `Forgiven debt can count as taxable income, with exceptions such as insolvency. Creditors generally send a Form 1099-C for ${usdWhole(FORM_THRESHOLD_CENTS)} or more. The Tax review page lists yours.`,
    debts.filter((d) => d.settlement && d.eliminated >= FORM_THRESHOLD_CENTS && !isTaxDebtType(d.debt.type) && !isSupportDebtType(d.debt.type)));
  return out;
}

// ---- Next steps ----

export type NextStep = { id: string; title: string; why: string; href: string };

export type StepInput = {
  debts: DebtFull[];
  stageByDebt: Map<string, Stage>;
  nextActionByDebt: Map<string, string | null>;
  reminders: Reminder[];
  incomeCount: number;
  livingCostsCents: number | null;
  surplusCents: number | null;
  taxPending: number;
  /** What the business must bring in monthly to break even, when income varies. */
  breakEvenCents?: number | null;
  /** First month cash goes below zero in the chosen view. */
  runsOutMonth?: string | null;
  view?: IncomeView;
  /** Expected events that will pay off debts. */
  payoffEvents?: { name: string; month: string; debtNames: string[] }[];
  today?: string;
};

export function nextSteps(i: StepInput): NextStep[] {
  const today = i.today ?? todayISO();
  const steps: NextStep[] = [];
  const open = i.debts.filter(isOpen);

  for (const r of i.reminders.filter(isTimeSensitive).slice(0, 3)) {
    steps.push({ id: `rem-${r.debtId}-${r.kind}`, title: r.title, why: r.detail, href: `/debts/${r.debtId}` });
  }

  const lateNotTracked = open
    .filter((d) => d.debt.delinquentSince && daysBetween(d.debt.delinquentSince, today) > 0 && !i.stageByDebt.has(d.debt.id) && !d.settlement)
    .sort((a, b) => consequenceTier(a.debt) - consequenceTier(b.debt) || b.owed - a.owed)
    .slice(0, 2);
  for (const d of lateNotTracked) {
    steps.push({
      id: `late-${d.debt.id}`,
      title: `Decide how to handle ${d.debt.name}`,
      why: `It is ${daysBetween(d.debt.delinquentSince!, today)} days late and no negotiation is being tracked. See the options below, or start tracking one.`,
      href: `/debts/${d.debt.id}`,
    });
  }

  const stillNegotiating = (s: Stage | undefined) => s === "silence" || s === "lawyer_letter" || s === "offer_sent" || s === "counter_offer";
  for (const d of open) {
    if (stillNegotiating(i.stageByDebt.get(d.debt.id)) && !i.nextActionByDebt.get(d.debt.id)) {
      steps.push({ id: `action-${d.debt.id}`, title: `Set a next action date for ${d.debt.name}`, why: "A date gives you a reminder, so it does not slip.", href: `/debts/${d.debt.id}` });
    }
  }

  const noPayment = open.filter((d) => !d.settlement && !isTaxDebtType(d.debt.type) && !d.debt.monthlyPaymentCents && !i.stageByDebt.has(d.debt.id));
  if (noPayment.length) {
    steps.push({
      id: "no-payment",
      title: `Add a rate and monthly payment for ${noPayment.length === 1 ? noPayment[0].debt.name : `${noPayment.length} debts`}`,
      why: "Without them the simulator cannot include these debts.",
      href: `/debts/${noPayment[0].debt.id}`,
    });
  }

  if (i.incomeCount === 0) steps.push({ id: "income", title: "Add your income", why: "The plan needs it to show what is left after your payments.", href: "/calendar" });
  if (i.livingCostsCents == null) steps.push({ id: "living", title: "Enter your monthly living costs", why: "Rent, food, utilities and other basics. It shows what you really have left for debt. You can list each cost separately.", href: "/living-costs" });
  if (i.taxPending > 0) steps.push({ id: "tax", title: `Review ${i.taxPending} settled ${i.taxPending === 1 ? "debt" : "debts"} for tax`, why: "Forgiven amounts can be taxable. Note what your tax professional says.", href: "/tax" });
  if (i.surplusCents != null && i.surplusCents > 0) {
    steps.push({ id: "extra", title: `See what ${usdWhole(i.surplusCents)} a month could do`, why: "That is what is left after living costs and scheduled payments. The simulator shows the effect on interest and time.", href: "/plan#simulator" });
  }
  if (i.runsOutMonth && i.view !== "full") {
    steps.push({
      id: "runs-out",
      title: `At this pace your cash runs out in ${monthLabel(i.runsOutMonth)}`,
      why: "Living costs and debt payments are higher than the income and one-time money you are counting. The outlook below shows it month by month.",
      href: "/plan#outlook",
    });
  }
  for (const e of i.payoffEvents ?? []) {
    steps.push({
      id: `payoff-${e.name}`,
      title: `Ask for exact payoff amounts: ${listNames(e.debtNames)}`,
      why: `${e.name} is expected in ${monthLabel(e.month)}. Interest and fees change the figure, and the exact amount in writing is what is needed at closing.`,
      href: "/debts",
    });
  }
  if (i.surplusCents != null && i.surplusCents < 0) {
    const gap = i.breakEvenCents && i.breakEvenCents > 0 ? ` With paychecks alone, the business would need to bring in about ${usdWhole(i.breakEvenCents)} a month to cover living costs and scheduled payments.` : "";
    steps.push({
      id: "short",
      title: "Your payments are higher than what you have left",
      why: `You are short by about ${usdWhole(-i.surplusCents)} a month in this view.${gap} Ask creditors about lower payments, or look at the payment plan options.`,
      href: "/plan#cash",
    });
  }
  return steps.slice(0, 6);
}

// ---- Story ----

export type StoryInput = {
  openCount: number;
  owedCents: number;
  originalCents: number;
  goneCents: number; // eliminated + paid
  monthlyObligationCents: number;
  monthlyIncomeCents: number | null;
  livingCostsCents: number | null;
  costliest: { name: string; rateBps: number; interestPerYearCents: number } | null;
  lateCount: number;
  urgentCount: number;
  extra: { extraCents: number; targetName: string; monthsSaved: number; interestSavedCents: number } | null;
  /** Only when some income varies (a side business forecast). */
  scenario?: {
    view: IncomeView;
    expectedCents: number; // the business this month at your confidence
    fullCents: number; // the business this month if it all goes well
    steadySurplus: number | null;
    expectedSurplus: number | null;
    fullSurplus: number | null;
    breakEvenCents: number | null;
  };
  /** The month-by-month cash picture, when living costs are known. */
  outlook?: { months: number; runsOutMonth: string | null; cashStartCents: number; view: IncomeView };
  /** Expected one-time events that pay off debts. */
  events?: { name: string; month: string; amountCents: number; payoffNames: string[]; payoffTotalCents: number; proceedsAfterCents: number; monthlyFreedCents: number }[];
};

/** "March 2027" from "2027-03". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const leaves = (n: number) => (n >= 0 ? `leave about ${usdWhole(n)} a month` : `leave you short by about ${usdWhole(-n)} a month`);

export function buildStory(s: StoryInput): string[] {
  const out: string[] = [];
  if (s.openCount === 0) return ["You have no open debts. Nothing to plan for right now."];
  const pct = s.originalCents > 0 ? Math.round((s.goneCents / s.originalCents) * 100) : 0;
  out.push(`You owe ${usdWhole(s.owedCents)} across ${s.openCount} open ${s.openCount === 1 ? "debt" : "debts"}. ${usdWhole(s.goneCents)} of the original ${usdWhole(s.originalCents)} (${pct}%) is already gone through settlements and payments.`);
  if (s.monthlyIncomeCents != null && s.monthlyIncomeCents > 0) {
    let line = `Your scheduled debt payments come to ${usdWhole(s.monthlyObligationCents)} a month against ${usdWhole(s.monthlyIncomeCents)} of income.`;
    if (s.livingCostsCents != null) {
      const left = s.monthlyIncomeCents - s.livingCostsCents - s.monthlyObligationCents;
      line += left >= 0 ? ` After living costs, about ${usdWhole(left)} is left each month.` : ` After living costs, you are short by about ${usdWhole(-left)} each month.`;
    } else {
      line += " Add your monthly living costs to see what is really left.";
    }
    out.push(line);
  } else {
    out.push(`Your scheduled debt payments come to ${usdWhole(s.monthlyObligationCents)} a month. Add your income on the Calendar page to see how that compares.`);
  }
  if (s.scenario) {
    const c = s.scenario;
    const counted =
      c.view === "steady" ? "only your paychecks, not the business"
      : c.view === "expected" ? `the business at your confidence (${usdWhole(c.expectedCents)} of ${usdWhole(c.fullCents)} a month)`
      : `the business at its full amount (${usdWhole(c.fullCents)} a month)`;
    out.push(`Business income is not certain, so this plan counts ${counted}.`);
    if (c.steadySurplus != null && c.expectedSurplus != null && c.fullSurplus != null) {
      const need = c.breakEvenCents && c.breakEvenCents > 0
        ? `With paychecks alone you would be short by about ${usdWhole(-c.steadySurplus)} a month, so the business has to bring in about ${usdWhole(c.breakEvenCents)} a month to break even. `
        : "Your paychecks alone cover your living costs and scheduled payments. ";
      out.push(`${need}Counting the business at your confidence would ${leaves(c.expectedSurplus)}, and at its full amount would ${leaves(c.fullSurplus)}.`);
    }
  }
  if (s.outlook) {
    const o = s.outlook;
    if (o.runsOutMonth) {
      out.push(`At this pace your cash runs out in ${monthLabel(o.runsOutMonth)}${o.cashStartCents === 0 ? " (starting from $0 in cash, so enter what you have on the Plan page)" : ""}.`);
    } else {
      out.push(`In this view your cash stays above zero for the next ${o.months} months.`);
    }
  }
  for (const e of s.events ?? []) {
    out.push(
      `If ${e.name} comes through in ${monthLabel(e.month)} (${usdWhole(e.amountCents)}), it would pay off ${listNames(e.payoffNames)} for about ${usdWhole(e.payoffTotalCents)}, ` +
        `leave about ${usdWhole(Math.max(0, e.proceedsAfterCents))}${e.proceedsAfterCents < 0 ? " (it falls short of the payoffs)" : ""}, and stop about ${usdWhole(e.monthlyFreedCents)} a month in payments.`,
    );
  }  if (s.costliest) out.push(`The costliest debt to carry is ${s.costliest.name}, at ${rateLabel(s.costliest.rateBps)}: about ${usdWhole(s.costliest.interestPerYearCents)} a year in interest.`);
  if (s.lateCount > 0 || s.urgentCount > 0) {
    const parts = [];
    if (s.lateCount > 0) parts.push(`${s.lateCount} ${s.lateCount === 1 ? "debt is" : "debts are"} late`);
    if (s.urgentCount > 0) parts.push(`${s.urgentCount} ${s.urgentCount === 1 ? "item has" : "items have"} a deadline coming up`);
    out.push(`${parts.join(" and ")}.`);
  }
  if (s.extra && s.extra.interestSavedCents > 0) {
    out.push(`If you put an extra ${usdWhole(s.extra.extraCents)} a month toward ${s.extra.targetName} and then roll the freed-up payments onward, the simulation saves about ${usdWhole(s.extra.interestSavedCents)} in interest and finishes ${s.extra.monthsSaved} ${s.extra.monthsSaved === 1 ? "month" : "months"} sooner.`);
  }
  return out;
}
