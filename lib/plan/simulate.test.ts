import { describe, expect, it } from "vitest";
import { amortize } from "../finance";
import { compareExtra, settlementWhatIf, simulate, type SimDebt } from "./simulate";

const card = (over: Partial<SimDebt> = {}): SimDebt => ({ id: "card", name: "Card", balanceCents: 1_000_000, aprBps: 2400, minPaymentCents: 30_000, ...over });
const loan = (over: Partial<SimDebt> = {}): SimDebt => ({ id: "loan", name: "Loan", balanceCents: 500_000, aprBps: 600, minPaymentCents: 20_000, ...over });

describe("simulate", () => {
  it("matches a plain amortization when there is one debt and no extra", () => {
    const sim = simulate([card()], { extraCents: 0, strategy: "avalanche" });
    const am = amortize({ balanceCents: 1_000_000, aprBps: 2400, paymentCents: 30_000, startDate: "2026-01-01" });
    expect(sim.months).toBe(am.rows.length);
    expect(sim.totalInterestCents).toBe(am.totalInterestCents);
    expect(sim.capped).toBe(false);
  });
  it("extra money finishes sooner and costs less interest", () => {
    const c = compareExtra([card(), loan()], 20_000, "avalanche");
    expect(c.monthsSaved).toBeGreaterThan(0);
    expect(c.interestSavedCents).toBeGreaterThan(0);
    expect(c.withExtra.totalInterestCents).toBeLessThan(c.baseline.totalInterestCents);
  });
  it("avalanche pays the highest rate first, snowball the smallest balance first", () => {
    const debts = [card({ balanceCents: 2_000_000 }), loan({ balanceCents: 300_000 })];
    const av = simulate(debts, { extraCents: 50_000, strategy: "avalanche" });
    const sn = simulate(debts, { extraCents: 50_000, strategy: "snowball" });
    const when = (r: typeof av, id: string) => r.perDebt.find((d) => d.id === id)!.payoffMonth!;
    expect(when(sn, "loan")).toBeLessThan(when(av, "loan")); // snowball clears the small loan first
    expect(av.totalInterestCents).toBeLessThanOrEqual(sn.totalInterestCents); // avalanche never pays more interest
  });
  it("rolls a finished debt's payment over to the next one", () => {
    const withRoll = simulate([card(), loan({ balanceCents: 40_000 })], { extraCents: 0, strategy: "avalanche" });
    const cardAlone = simulate([card()], { extraCents: 0, strategy: "avalanche" });
    expect(withRoll.perDebt.find((d) => d.id === "card")!.payoffMonth!).toBeLessThan(cardAlone.months + 3);
    expect(withRoll.perDebt.find((d) => d.id === "card")!.payoffMonth!).toBeLessThan(cardAlone.perDebt[0].payoffMonth!);
  });
  it("never sends extra money to a settled (fixed) debt", () => {
    const settled: SimDebt = { id: "set", name: "Settled", balanceCents: 1_200_000, aprBps: 0, minPaymentCents: 100_000, fixed: true };
    const r = simulate([settled, card()], { extraCents: 500_000, strategy: "avalanche" });
    expect(r.perDebt.find((d) => d.id === "set")!.payoffMonth).toBe(12); // exactly its 12 installments
    expect(r.perDebt.find((d) => d.id === "set")!.interestCents).toBe(0);
  });
  it("flags a payment that does not cover the interest", () => {
    const r = simulate([card({ minPaymentCents: 10_000 })], { extraCents: 0, strategy: "avalanche", maxMonths: 120 });
    expect(r.capped).toBe(true);
    expect(r.stuck).toEqual(["card"]);
  });
  it("handles no debts", () => {
    expect(simulate([], { extraCents: 10_000, strategy: "avalanche" })).toMatchObject({ months: 0, capped: false, totalPaidCents: 0 });
  });
  it("pays exactly what it should: total paid = balance + interest", () => {
    const r = simulate([card(), loan()], { extraCents: 15_000, strategy: "snowball" });
    expect(r.totalPaidCents).toBe(1_500_000 + r.totalInterestCents);
  });
});

describe("settlement what-if", () => {
  it("computes savings and the monthly payment", () => {
    expect(settlementWhatIf(15_500_000, 5_000_000, 36)).toEqual({ offerCents: 5_000_000, eliminatedCents: 10_500_000, percentOfBalance: 32, installmentCents: 138_889, installments: 36 });
  });
  it("never reports negative savings and handles zero payments", () => {
    expect(settlementWhatIf(100_000, 150_000, 0)).toMatchObject({ eliminatedCents: 0, installments: 1, installmentCents: 150_000 });
  });
});
