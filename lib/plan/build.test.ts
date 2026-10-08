import { describe, expect, it } from "vitest";
import type { Debt, Entity, Income } from "../db/schema";
import { balanceAt, eliminated, totalPaid } from "../finance";
import type { DebtFull } from "../queries";
import { buildPlan, type PlanEvent } from "./build";

// A situation like a real one: two debts with the same name (back taxes for two different governments), a car loan,
// a large mortgage-like loan, paychecks, a business forecast and a property sale that cannot cover everything.

const TODAY = "2026-10-26";
const entity: Entity = { id: "e", ownerId: "u", name: "Me", kind: "person", isExample: false, createdAt: "" };
const c = (dollars: number) => Math.round(dollars * 100);

function debt(id: string, name: string, type: Debt["type"], owed: number, rate: number, monthly: number, day: number, extra: Partial<Debt> = {}): DebtFull {
  const d: Debt = {
    id, ownerId: "u", entityId: "e", name, creditor: "", type, originalCents: c(owed), rateBps: rate, collateral: "", personalGuarantee: false,
    government: false, status: "active", delinquentSince: null, monthlyPaymentCents: c(monthly), paymentDay: day, notes: "", isExample: false, createdAt: "2026-01-01", ...extra,
  };
  const bundle = { debt: d, settlement: null, payments: [] as never[] };
  return { ...bundle, entity, owed: balanceAt(bundle, TODAY), eliminated: eliminated(bundle), paid: totalPaid(bundle), target: d.originalCents };
}

const fed = debt("fed", "Back Taxes 2024", "federal_tax", 115_000, 850, 2_200, 5, { government: true });
const state = debt("state", "Back Taxes 2024", "state_tax", 20_000, 800, 400, 5, { government: true });
const car = debt("car", "Car Loan", "auto_loan", 25_000, 1100, 600, 12);
const home = debt("home", "Newrez", "secured", 594_000, 450, 3_500, 1, { collateral: "House" });
const debts = [fed, state, car, home];

const pay = (n: string, dollars: number, day: number): Income => ({
  id: n + day, ownerId: "u", name: n, amountCents: c(dollars), dayOfMonth: day, kind: "steady", lowCents: null, entityId: null, confidencePercent: null, startsOn: null, endsOn: null, isExample: false, createdAt: "",
});
const business: Income = { ...pay("Side business", 10_000, 31), kind: "variable", confidencePercent: 80, startsOn: "2026-10-01", endsOn: "2027-03-31" };
const income = [pay("Paycheck", 5_600, 15), pay("Paycheck", 5_600, 31), business];

const sale = (confidence: number, debtIds = ["state", "fed", "car"]): PlanEvent => ({
  id: "sale", name: "Sale of Property", direction: "in", amountCents: c(150_000), expectedMonth: "2026-11-01", confidencePercent: confidence, note: "", payoffDebtIds: debtIds,
});

const base = { debts, negs: [], offers: [], income, taxRows: [], entities: [], livingCostsCents: c(4_069), cashOnHandCents: null, today: TODAY, months: 12 };
const month = (p: ReturnType<typeof buildPlan>, m: string) => p.outlook.find((x) => x.month === m)!;

describe("a sale that pays off debts", () => {
  const plan = buildPlan({ ...base, events: [sale(80)] });
  const ev = plan.eventPlans[0];

  it("pays off what the money covers, most serious first, and says what it does not cover", () => {
    expect(ev.payoffs.map((p) => p.debtId)).toEqual(["fed", "car"]); // $115,000 then $25,000 of $150,000
    expect(ev.notCovered.map((p) => p.debtId)).toEqual(["state"]); // $20,000 does not fit in the $10,000 left
    expect(ev.proceedsAfterCents).toBe(c(10_000));
    expect(ev.shortByCents).toBe(c(10_000));
  });
  it("tells two debts with the same name apart", () => {
    expect(ev.payoffs[0].name).toBe("Back Taxes 2024 (Federal back taxes)");
    expect(ev.notCovered[0].name).toBe("Back Taxes 2024 (State back taxes)");
  });
  it("counts the payments that stop: the $2,200 federal payment and the car payment", () => {
    expect(ev.monthlyFreedCents).toBe(c(2_800));
  });
  it("lowers the monthly debt payments after the sale in the plan's main view", () => {
    expect(plan.view).toBe("expected");
    expect(month(plan, "2026-10").obligations.expected).toBe(c(6_700));
    expect(month(plan, "2026-11").obligations.expected).toBe(c(6_700)); // the month it closes, this month's payments still happen
    expect(month(plan, "2026-12").obligations.expected).toBe(c(3_900)); // $2,200 and $600 are gone
    expect(month(plan, "2027-06").obligations.expected).toBe(c(3_900));
  });
  it("does not scale the sale by confidence: at 80% sure it counts in full, less what it pays off", () => {
    expect(month(plan, "2026-11").events.expected).toBe(c(10_000)); // $150,000 - $140,000
  });
  it("leaves the paychecks-only view untouched", () => {
    expect(month(plan, "2026-12").obligations.steady).toBe(c(6_700));
    expect(month(plan, "2026-11").events.steady).toBe(0);
  });
  it("lowers the monthly debt payments by the same amount in the best case", () => {
    expect(month(plan, "2026-12").obligations.full).toBe(c(3_900));
  });
  it("makes the month after better by exactly the payments that stop", () => {
    expect((ev.monthlyLeftAfter ?? 0) - (ev.monthlyLeftBefore ?? 0)).toBe(c(2_800));
  });
  it("describes it in the story and asks for payoff amounts for the covered debts", () => {
    const text = plan.story.join(" ");
    expect(text).toMatch(/pay off Back Taxes 2024 \(Federal back taxes\) and Car Loan for about \$140,000/);
    expect(text).toMatch(/stop about \$2,800 a month in payments/);
    expect(text).toMatch(/would not also cover Back Taxes 2024 \(State back taxes\), which falls about \$10,000 short/);
    expect(plan.steps.find((s) => s.id.startsWith("payoff-"))?.title).toBe("Ask for exact payoff amounts: Back Taxes 2024 (Federal back taxes) and Car Loan");
  });
  it("tells you when the business forecast ends inside the outlook", () => {
    expect(plan.forecastEnding).toEqual([{ name: "Side business", month: "2027-04" }]);
    expect(month(plan, "2027-03").expectedCents).toBe(c(8_000));
    expect(month(plan, "2027-04").expectedCents).toBe(0);
  });
});

describe("a sale that is less certain", () => {
  const plan = buildPlan({ ...base, events: [sale(30)] });
  it("is not counted in what you expect, but is in the best case", () => {
    expect(month(plan, "2026-11").events.expected).toBe(0);
    expect(month(plan, "2026-12").obligations.expected).toBe(c(6_700));
    expect(month(plan, "2026-11").events.full).toBe(c(10_000));
    expect(month(plan, "2026-12").obligations.full).toBe(c(3_900));
    expect(plan.eventPlans[0].counted).toBe(false);
  });
  it("says the main view does not count it", () => {
    expect(plan.story.join(" ")).toMatch(/This view does not count it/);
  });
});

describe("a sale that covers everything it was meant to pay off", () => {
  const plan = buildPlan({ ...base, events: [{ ...sale(90, ["fed", "car"]) }] });
  it("has nothing left uncovered", () => {
    expect(plan.eventPlans[0].notCovered).toEqual([]);
    expect(plan.eventPlans[0].shortByCents).toBe(0);
    expect(plan.story.join(" ")).not.toMatch(/would not also cover/);
  });
});

describe("a sale too small to pay off anything it names", () => {
  const plan = buildPlan({ ...base, events: [{ ...sale(90, ["fed"]), amountCents: c(50_000) }] });
  it("pays nothing off and says how far short it is", () => {
    expect(plan.eventPlans[0].payoffs).toEqual([]);
    expect(plan.eventPlans[0].shortByCents).toBe(c(65_000));
    expect(plan.story.join(" ")).toMatch(/it would not cover Back Taxes 2024 \(Federal back taxes\), which falls about \$65,000 short/);
    expect(month(plan, "2026-12").obligations.expected).toBe(c(6_700)); // nothing paid off, nothing stops
  });
});

describe("money going out", () => {
  it("counts a possible bill from 25% sure, in full", () => {
    const bill: PlanEvent = { id: "b", name: "Roof", direction: "out", amountCents: c(8_000), expectedMonth: "2026-12-01", confidencePercent: 30, note: "", payoffDebtIds: [] };
    const plan = buildPlan({ ...base, events: [bill] });
    expect(month(plan, "2026-12").events.expected).toBe(-c(8_000));
    expect(month(plan, "2026-12").events.steady).toBe(0);
  });
});
