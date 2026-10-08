import { describe, expect, it } from "vitest";
import type { Debt, Entity, Settlement, Stage } from "../db/schema";
import { balanceAt, eliminated, totalPaid } from "../finance";
import { buildReminders } from "../negotiation";
import type { DebtFull } from "../queries";
import { DISCLAIMER, buildStory, consequenceTier, didYouKnow, nextSteps, priorities } from "./guidance";

const TODAY = "2026-10-05";
const entity: Entity = { id: "e", ownerId: "u", name: "Biz", kind: "business", isExample: false, createdAt: "" };

function mk(over: Partial<Debt>, settlement: Partial<Settlement> | null = null, paid = 0): DebtFull {
  const debt: Debt = {
    id: over.name ?? "d", ownerId: "u", entityId: "e", name: "Debt", creditor: "", type: "other", originalCents: 1_000_000, rateBps: null,
    collateral: "", personalGuarantee: false, government: false, status: "active", delinquentSince: null, monthlyPaymentCents: null,
    paymentDay: null, notes: "", isExample: false, createdAt: "2026-01-01", ...over,
  };
  const s: Settlement | null = settlement
    ? { id: "s", ownerId: "u", debtId: debt.id, agreedCents: 300_000, installmentCents: 100_000, installments: 3, agreedOn: "2026-02-01", firstPaymentOn: "2026-03-01", notes: "", createdAt: "", ...settlement }
    : null;
  const payments = paid ? [{ id: "p", ownerId: "u", debtId: debt.id, paidOn: "2026-03-01", amountCents: paid, interestCents: 0, note: "", createdAt: "" }] : [];
  const bundle = { debt, settlement: s, payments };
  return { ...bundle, entity, owed: balanceAt(bundle, TODAY), eliminated: eliminated(bundle), paid: totalPaid(bundle), target: s ? s.agreedCents : debt.originalCents };
}

const irs = mk({ name: "IRS", type: "federal_tax", government: true, delinquentSince: "2026-03-01" });
const card = mk({ name: "Card", type: "credit_card", rateBps: 2400, monthlyPaymentCents: 30_000, delinquentSince: "2026-08-01" });
const lowCard = mk({ name: "Low card", type: "credit_card", rateBps: 1000, monthlyPaymentCents: 10_000 });
const auto = mk({ name: "Auto", type: "auto_loan", rateBps: 700, monthlyPaymentCents: 40_000, originalCents: 900_000 });
const guaranteed = mk({ name: "Biz loan", type: "business_loan", personalGuarantee: true, rateBps: 1700, delinquentSince: "2026-07-01" });
const settled = mk({ name: "Settled", type: "credit_card" }, {});
const paidOff = mk({ name: "Done", status: "paid", originalCents: 100_000 }, null, 100_000);
const all = [irs, card, lowCard, auto, guaranteed, settled, paidOff];

describe("consequence tiers", () => {
  it("puts back taxes, government loans, mortgages and auto loans first", () => {
    expect([irs, auto, mk({ type: "mortgage" }), mk({ type: "government_loan", government: true })].map((d) => consequenceTier(d.debt))).toEqual([1, 1, 1, 1]);
  });
  it("puts secured or guaranteed debts second and plain unsecured debts last", () => {
    expect(consequenceTier(guaranteed.debt)).toBe(2);
    expect(consequenceTier(mk({ collateral: "Windows" }).debt)).toBe(2);
    expect(consequenceTier(card.debt)).toBe(3);
  });
});

describe("priorities", () => {
  const list = priorities(all, new Map(), TODAY);
  it("skips paid debts and orders by tier, then lateness, then interest", () => {
    // Tier 1: IRS (218 days late) before Auto (current). Tier 2: Biz loan. Tier 3: Card (late), then by interest.
    expect(list.map((p) => p.name)).toEqual(["IRS", "Auto", "Biz loan", "Card", "Low card", "Settled"]);
    expect(list.some((p) => p.name === "Done")).toBe(false);
  });
  it("gives each debt facts, options and questions", () => {
    for (const p of list) {
      expect(p.facts.length).toBeGreaterThan(0);
      expect(p.options.length).toBeGreaterThan(0);
      expect(p.questions.length).toBeGreaterThan(1);
    }
  });
  it("tailors options to the kind of debt", () => {
    const text = (n: string) => list.find((p) => p.name === n)!.options.join(" ");
    expect(text("IRS")).toMatch(/payment plans and compromise/);
    expect(text("Auto")).toMatch(/modification, deferral or refinancing/);
    expect(text("Card")).toMatch(/hardship, payment-plan or settlement/);
    expect(text("Settled")).toMatch(/agreed schedule/);
    expect(text("Biz loan")).toMatch(/personal guarantee/);
  });
  it("never tells anyone to stop paying, ignore a creditor, or which option to pick", () => {
    const banned = /stop paying|ignore|don't pay|do not pay|you should|you must|we recommend|skip (the )?payment|default on/i;
    const everything = [
      ...list.flatMap((p) => [...p.facts, ...p.options, ...p.questions]),
      ...didYouKnow(all, TODAY).flatMap((f) => [f.title, f.text]),
      DISCLAIMER,
    ].join("\n");
    expect(everything).not.toMatch(banned);
  });
  it("shows the negotiation stage when there is one", () => {
    const stages = new Map<string, Stage>([["Card", "offer_sent"]]);
    expect(priorities(all, stages, TODAY).find((p) => p.name === "Card")!.facts.join(" ")).toMatch(/Offer sent/);
  });
});

describe("did you know", () => {
  const facts = didYouKnow(all, TODAY);
  it("only shows notes for debts the user actually has", () => {
    expect(facts.find((f) => f.id === "irs")?.about).toEqual(["IRS"]);
    expect(facts.find((f) => f.id === "secured")?.about).toEqual(["Auto"]);
    expect(facts.find((f) => f.id === "guarantee")?.about).toEqual(["Biz loan"]);
    expect(facts.find((f) => f.id === "payroll")).toBeUndefined();
  });
  it("explains the time limit and collector rules for late unsecured debt", () => {
    expect(facts.find((f) => f.id === "limit")?.about).toContain("Card");
    expect(facts.find((f) => f.id === "collectors")).toBeDefined();
  });
  it("shows nothing when there is nothing to say", () => {
    expect(didYouKnow([paidOff], TODAY)).toEqual([]);
  });
});

describe("next steps", () => {
  const base = { debts: all, stageByDebt: new Map<string, Stage>(), nextActionByDebt: new Map<string, string | null>(), reminders: [], incomeCount: 2, livingCostsCents: 200_000, surplusCents: 50_000, taxPending: 0, today: TODAY };
  it("asks to decide about late debts that are not being worked on, highest consequence first", () => {
    const steps = nextSteps(base);
    expect(steps[0].title).toMatch(/Decide how to handle IRS/);
  });
  it("asks for missing basics", () => {
    const steps = nextSteps({ ...base, incomeCount: 0, livingCostsCents: null, surplusCents: null });
    expect(steps.map((s) => s.id)).toEqual(expect.arrayContaining(["income", "living"]));
  });
  it("points to the simulator when there is money left over, and warns when short", () => {
    expect(nextSteps(base).some((s) => s.id === "extra")).toBe(true);
    expect(nextSteps({ ...base, surplusCents: -30_000 }).find((s) => s.id === "short")?.why).toMatch(/short by about \$300/);
  });
  it("puts urgent reminders first and never returns more than six steps", () => {
    const reminders = buildReminders(
      [{ id: "Card", name: "Card", status: "negotiating", owedCents: 1, delinquentSince: null }],
      [{ debtId: "Card", stage: "counter_offer", silenceStartedOn: null, silenceDays: null, nextActionOn: "2026-10-06", nextActionNote: "Reply" }],
      [],
      TODAY,
    );
    const steps = nextSteps({ ...base, reminders, taxPending: 2, incomeCount: 0, livingCostsCents: null, surplusCents: null });
    expect(steps[0].title).toMatch(/Reply/);
    expect(steps.length).toBeLessThanOrEqual(6);
  });
  it("asks for a next action date when a negotiation is still open and has none", () => {
    const steps = nextSteps({ ...base, stageByDebt: new Map([["Card", "offer_sent" as Stage]]), nextActionByDebt: new Map([["Card", null]]) });
    expect(steps.some((s) => s.id === "action-Card")).toBe(true);
  });
  it("does not ask for a date once the settlement is agreed and being paid", () => {
    for (const stage of ["accepted", "paying", "closed"] as Stage[]) {
      const steps = nextSteps({ ...base, stageByDebt: new Map([["Card", stage]]), nextActionByDebt: new Map([["Card", null]]) });
      expect(steps.some((s) => s.id === "action-Card")).toBe(false);
    }
  });
});

describe("story", () => {
  const input = { openCount: 5, owedCents: 25_000_000, originalCents: 61_600_000, goneCents: 36_000_000, monthlyObligationCents: 330_000, monthlyIncomeCents: 420_000, livingCostsCents: 60_000, costliest: { name: "Card", rateBps: 2400, interestPerYearCents: 240_000 }, lateCount: 2, urgentCount: 1, extra: { extraCents: 20_000, targetName: "Card", monthsSaved: 6, interestSavedCents: 150_000 } };
  it("tells it in plain sentences with the user's numbers", () => {
    const text = buildStory(input).join(" ");
    expect(text).toMatch(/You owe \$250,000 across 5 open debts/);
    expect(text).toMatch(/58%/);
    expect(text).toMatch(/\$4,200 of income/);
    expect(text).toMatch(/about \$300 is left each month/);
    expect(text).toMatch(/costliest debt to carry is Card/);
    expect(text).toMatch(/2 debts are late and 1 item has a deadline/);
    expect(text).toMatch(/saves about \$1,500 in interest and finishes 6 months sooner/);
  });
  it("prompts for missing income or living costs", () => {
    expect(buildStory({ ...input, monthlyIncomeCents: null, extra: null }).join(" ")).toMatch(/Add your income/);
    expect(buildStory({ ...input, livingCostsCents: null }).join(" ")).toMatch(/Add your monthly living costs/);
  });
  it("handles having no debts", () => {
    expect(buildStory({ ...input, openCount: 0 })[0]).toMatch(/no open debts/);
  });
});
