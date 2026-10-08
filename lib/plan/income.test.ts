import { describe, expect, it } from "vitest";
import type { EventLike } from "./events";
import {
  activeIn, breakEvenFromVariable, cashRunsOut, confidenceLabel, defaultView, expectedOf, incomeForView, incomeScenarios, outlook, parseView, surplusByView,
  type IncomeRowLike,
} from "./income";

const pay = (cents: number): IncomeRowLike => ({ amountCents: cents, kind: "steady", confidencePercent: null, startsOn: null, endsOn: null });
const biz = (cents: number, confidence: number, startsOn: string | null = null, endsOn: string | null = null): IncomeRowLike => ({
  amountCents: cents, kind: "variable", confidencePercent: confidence, startsOn, endsOn,
});

describe("business forecast", () => {
  it("counts the amount times your confidence", () => {
    expect(expectedOf(biz(1_000_000, 60))).toBe(600_000);
    expect(expectedOf(biz(1_000_000, 100))).toBe(1_000_000);
    expect(expectedOf(biz(1_000_000, 0))).toBe(0);
    expect(expectedOf({ ...biz(1_000_000, 60), confidencePercent: null })).toBe(1_000_000); // no confidence given: counted in full
  });
  it("labels confidence", () => {
    expect([20, 40, 41, 70, 71, 100].map(confidenceLabel)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });
  it("applies only to the months it covers", () => {
    const r = biz(500_000, 80, "2026-11-01", "2027-10-31");
    expect(["2026-10", "2026-11", "2027-04", "2027-10", "2027-11"].map((m) => activeIn(r, m))).toEqual([false, true, true, true, false]);
    expect(activeIn(biz(500_000, 80), "2040-01")).toBe(true); // no dates: always
    expect(activeIn(biz(500_000, 80, "2026-11-01", null), "2050-01")).toBe(true); // no end
  });
});

describe("scenarios for a month", () => {
  const rows = [pay(210_000), pay(210_000), biz(1_000_000, 60, "2026-10-01", "2027-09-30")];
  it("separates paychecks from the business at confidence and at full amount", () => {
    expect(incomeScenarios(rows, "2026-10")).toMatchObject({ hasSteady: true, hasVariable: true, activeVariable: true, steadyCents: 420_000, expectedCents: 600_000, fullCents: 1_000_000 });
  });
  it("drops the business once its period is over, but still knows one exists", () => {
    expect(incomeScenarios(rows, "2027-10")).toMatchObject({ hasVariable: true, activeVariable: false, expectedCents: 0, fullCents: 0 });
  });
  it("adds several businesses together", () => {
    const two = [pay(100_000), biz(1_000_000, 50), biz(400_000, 100)];
    expect(incomeScenarios(two, "2026-10")).toMatchObject({ expectedCents: 900_000, fullCents: 1_400_000 });
  });
  it("counts the chosen level", () => {
    const s = incomeScenarios(rows, "2026-10");
    expect([incomeForView(s, "steady"), incomeForView(s, "expected"), incomeForView(s, "full")]).toEqual([420_000, 1_020_000, 1_420_000]);
  });
  it("defaults to your own confidence when there is business income, paychecks only otherwise", () => {
    expect(defaultView(incomeScenarios(rows, "2026-10"))).toBe("expected");
    expect(defaultView(incomeScenarios([pay(100_000)], "2026-10"))).toBe("steady");
    const s = incomeScenarios(rows, "2026-10");
    expect(parseView(undefined, s)).toBe("expected");
    expect(parseView("full", s)).toBe("full");
    expect(parseView("nonsense", s)).toBe("expected");
  });
  it("handles no income", () => {
    expect(incomeScenarios([], "2026-10")).toMatchObject({ hasSteady: false, hasVariable: false, steadyCents: 0, expectedCents: 0 });
  });
});

describe("what is left", () => {
  const s = incomeScenarios([pay(420_000), biz(1_000_000, 60)], "2026-10");
  it("shows the shortfall with paychecks alone and what the business changes", () => {
    // living $2,000 + scheduled debt payments $6,000 = $8,000 a month needed
    expect(surplusByView(s, 200_000, 600_000)).toEqual({ steady: -380_000, expected: 220_000, full: 620_000 });
  });
  it("needs the business to bring in the gap to break even", () => {
    expect(breakEvenFromVariable(s, 200_000, 600_000)).toBe(380_000);
    expect(breakEvenFromVariable(s, 100_000, 200_000)).toBe(0);
  });
  it("is unknown until living costs are entered", () => {
    expect(surplusByView(s, null, 600_000)).toEqual({ steady: null, expected: null, full: null });
    expect(breakEvenFromVariable(s, null, 600_000)).toBeNull();
  });
});

describe("outlook", () => {
  // Debt payments are $6,000 a month: $1,500 of back taxes, $500 of auto loan, $4,000 of other debts.
  const monthly: Record<string, number> = { taxes: 150_000, auto: 50_000, other: 400_000 };
  const obligationsFor = (month: string, paidOff: ReadonlySet<string>) =>
    Object.entries(monthly).reduce((t, [id, c]) => t + (paidOff.has(id) ? 0 : c), 0) - (month >= "2027-01" ? 100_000 : 0); // a settlement ends in January
  const payoffCostFor = (id: string) => ({ taxes: 4_000_000, auto: 1_200_000, other: 0 }[id] ?? 0);
  const rows = [pay(420_000), biz(1_000_000, 60, "2026-11-01", "2027-02-28")];
  const base = { rows, startMonth: "2026-11", months: 6, livingCents: 200_000, obligationsFor, payoffCostFor };

  it("runs month by month", () => {
    expect(outlook({ ...base, events: [] }).map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });
  it("uses the business income only in the months it applies", () => {
    expect(outlook({ ...base, events: [] }).map((m) => m.expectedCents)).toEqual([600_000, 600_000, 600_000, 600_000, 0, 0]);
  });
  it("shows the improvement when a settlement ends", () => {
    const o = outlook({ ...base, events: [] });
    expect(o[1].left.steady).toBe(420_000 - 200_000 - 600_000);
    expect(o[2].left.steady).toBe(420_000 - 200_000 - 500_000);
  });
  it("runs a running cash balance from the cash on hand", () => {
    const o = outlook({ ...base, events: [], cashCents: 1_000_000 });
    expect(o[0].balance.steady).toBe(1_000_000 - 380_000);
    expect(o[1].balance.steady).toBe(1_000_000 - 760_000);
    expect(cashRunsOut(o, "steady")).toBe("2027-01"); // $10,000 - $3,800 - $3,800 - $2,800 is below zero in January
  });

  describe("selling a property that pays off the back taxes and the auto loan", () => {
    const sale: EventLike = { direction: "in", amountCents: 15_000_000, expectedMonth: "2027-01-01", confidencePercent: 70, payoffDebtIds: ["taxes", "auto"] };
    const o = outlook({ ...base, events: [sale] });
    const jan = o[2];
    const feb = o[3];
    it("when you are sure enough, counts the whole sale and pays the debts from it", () => {
      expect(jan.events.expected).toBe(15_000_000 - 4_000_000 - 1_200_000); // $98,000 left, not 70% of $150,000
      expect(jan.paidOff.expected.map((p) => p.debtId).sort()).toEqual(["auto", "taxes"]);
      expect(jan.events.steady).toBe(0);
    });
    it("their monthly payments stop from the following month, in the same view", () => {
      expect(jan.obligations.expected).toBe(jan.obligations.steady); // paid at closing, this month's payment still counted
      expect(feb.obligations.expected).toBe(feb.obligations.steady - 200_000); // $1,500 + $500 gone
      expect(feb.obligations.steady).toBe(o[2].obligations.steady); // paychecks-only does not change
      expect(feb.left.expected - feb.left.steady).toBe(200_000 + feb.expectedCents);
    });
    it("the best case does the same", () => {
      expect(jan.events.full).toBe(jan.events.expected);
      expect(feb.obligations.full).toBe(feb.obligations.expected);
    });
    it("when you are not sure enough, only the best case counts it", () => {
      const unsure = outlook({ ...base, events: [{ ...sale, confidencePercent: 30 }] });
      expect(unsure[2].events.expected).toBe(0);
      expect(unsure[2].paidOff.expected).toEqual([]);
      expect(unsure[3].obligations.expected).toBe(unsure[3].obligations.steady);
      expect(unsure[2].events.full).toBe(9_800_000);
      expect(unsure[3].obligations.full).toBe(unsure[3].obligations.steady - 200_000);
    });
    it("never pays a debt off twice", () => {
      const twice = outlook({ ...base, events: [sale, { ...sale, expectedMonth: "2027-03-01", amountCents: 1_000_000, confidencePercent: 100 }] });
      expect(twice[4].paidOff.expected).toEqual([]);
      expect(twice[4].events.expected).toBe(1_000_000);
    });
  });
  describe("a sale that cannot cover every debt it names", () => {
    const small: EventLike = { direction: "in", amountCents: 4_500_000, expectedMonth: "2027-01-01", confidencePercent: 100, payoffDebtIds: ["taxes", "auto"] };
    const o = outlook({ ...base, events: [small] });
    it("pays the first one in the order given and leaves the one that does not fit", () => {
      expect(o[2].paidOff.expected.map((p) => p.debtId)).toEqual(["taxes"]);
      expect(o[2].events.expected).toBe(500_000); // $45,000 - $40,000
      expect(o[3].obligations.expected).toBe(o[3].obligations.steady - 150_000); // only the taxes payment stops
    });
  });  it("counts money going out, and ignores payoffs on it", () => {
    const bill: EventLike = { direction: "out", amountCents: 500_000, expectedMonth: "2026-12-01", confidencePercent: 100, payoffDebtIds: ["taxes"] };
    const o = outlook({ ...base, events: [bill] });
    expect(o[1].events).toEqual({ steady: 0, expected: -500_000, full: -500_000 });
    expect(o[1].paidOff).toEqual({ expected: [], full: [] });
  });
});
