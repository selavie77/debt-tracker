import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";
import { toCents, usd } from "./money";
import {
  amortize,
  balanceAt,
  balanceSteps,
  eliminated,
  monthlyTotals,
  nextDue,
  settlementSchedule,
  type DebtBundle,
} from "./finance";

const hbj = (payments: { paidOn: string; amountCents: number }[] = []): DebtBundle => ({
  debt: { originalCents: 15_500_000, rateBps: 1700, status: "settled", monthlyPaymentCents: null, paymentDay: null },
  settlement: {
    agreedCents: 5_000_000,
    installmentCents: 138_889,
    installments: 36,
    agreedOn: "2025-12-20",
    firstPaymentOn: "2026-01-15",
  },
  payments: payments.map((p) => ({ ...p, interestCents: 0 })),
});

describe("money", () => {
  it("parses dollars into cents", () => {
    expect(toCents("1,388.50")).toBe(138850);
    expect(toCents("$50,000")).toBe(5_000_000);
    expect(Number.isNaN(toCents("abc"))).toBe(true);
  });
  it("formats cents", () => expect(usd(138850)).toBe("$1,388.5"));
});

describe("dates", () => {
  it("clamps month end", () => expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"));
  it("rolls the year", () => expect(addMonths("2026-11-15", 3)).toBe("2027-02-15"));
});

describe("settlement", () => {
  it("eliminates original minus agreed", () => expect(eliminated(hbj())).toBe(10_500_000));
  it("balance starts at the agreed amount", () => expect(balanceAt(hbj(), "2026-01-01")).toBe(5_000_000));
  it("balance before agreement is the original", () => expect(balanceAt(hbj(), "2025-11-01")).toBe(15_500_000));
  it("balance drops with each payment", () => {
    const b = hbj([
      { paidOn: "2026-01-15", amountCents: 138_889 },
      { paidOn: "2026-02-15", amountCents: 138_889 },
    ]);
    expect(balanceAt(b, "2026-03-01")).toBe(5_000_000 - 277_778);
    expect(balanceSteps(b).map((s) => s.balanceCents)).toEqual([5_000_000, 4_861_111, 4_722_222]);
  });
  it("schedule sums exactly to the agreed amount", () => {
    const sched = settlementSchedule(hbj().settlement!);
    expect(sched).toHaveLength(36);
    expect(sched.reduce((a, s) => a + s.amountCents, 0)).toBe(5_000_000);
    expect(sched[35].date).toBe("2028-12-15");
  });
  it("next due follows the number of payments made", () => {
    const b = hbj([{ paidOn: "2026-01-15", amountCents: 138_889 }]);
    expect(nextDue(b, "2026-02-01")?.date).toBe("2026-02-15");
  });
  it("never goes below zero", () => {
    const b = hbj([{ paidOn: "2026-01-15", amountCents: 9_000_000 }]);
    expect(balanceAt(b, "2026-02-01")).toBe(0);
    expect(nextDue(b, "2026-02-01")).toBeNull();
  });
});

describe("amortization", () => {
  it("pays off a 30-year loan at 3.75% for roughly $750 a month", () => {
    const r = amortize({ balanceCents: 15_000_000, aprBps: 375, paymentCents: 69_463, startDate: "2026-01-01" });
    expect(r.rows.length).toBeGreaterThan(355);
    expect(r.rows.length).toBeLessThanOrEqual(361);
    expect(r.rows[r.rows.length - 1].balanceCents).toBe(0);
  });
  it("flags a payment that does not cover interest", () => {
    const r = amortize({ balanceCents: 10_000_000, aprBps: 2200, paymentCents: 100_000, startDate: "2026-01-01" });
    expect(r.payoffNever).toBe(true);
  });
});

describe("loan without settlement", () => {
  it("reduces balance by principal only", () => {
    const b: DebtBundle = {
      debt: { originalCents: 1_000_000, rateBps: 1200, status: "active", monthlyPaymentCents: null, paymentDay: null },
      settlement: null,
      payments: [{ paidOn: "2026-01-01", amountCents: 50_000, interestCents: 10_000 }],
    };
    expect(balanceAt(b, "2026-02-01")).toBe(960_000);
  });
});

describe("monthly totals", () => {
  it("shows the drop when a settlement is agreed", () => {
    const rows = monthlyTotals([hbj()], "2025-11-01", "2026-01-31");
    expect(rows.map((r) => r.owedCents)).toEqual([15_500_000, 5_000_000, 5_000_000]);
  });
});
