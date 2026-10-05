import { describe, expect, it } from "vitest";
import { monthEvents, monthTotals, shiftMonth, type CalBundle } from "./calendar";
import { addDays } from "./dates";
import { buildReminders, nextStage, silenceProgress } from "./negotiation";

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-08-06", 92)).toBe("2026-11-06");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("stages and silence", () => {
  it("walks the pipeline in order", () => {
    expect(nextStage("silence")).toBe("lawyer_letter");
    expect(nextStage("closed")).toBeNull();
  });
  it("counts silence days", () => {
    const p = silenceProgress({ silenceStartedOn: "2026-08-06", silenceDays: 92 }, "2026-10-05");
    expect(p).toMatchObject({ elapsed: 60, left: 32, endsOn: "2026-11-06" });
  });
  it("has no timer without a start date", () => {
    expect(silenceProgress({ silenceStartedOn: null, silenceDays: 90 }, "2026-10-05")).toBeNull();
  });
});

const debts = [
  { id: "a", name: "Windows", status: "negotiating", owedCents: 2_100_000, delinquentSince: "2026-08-06" },
  { id: "b", name: "Amex", status: "negotiating", owedCents: 1_200_000, delinquentSince: null },
];
const neg = (o: object = {}) => ({ debtId: "a", stage: "silence" as const, silenceStartedOn: "2026-08-06", silenceDays: 92, nextActionOn: null, nextActionNote: "", ...o });

describe("reminders", () => {
  it("flags late debts, crit at 90 days", () => {
    const r = buildReminders(debts, [], [], "2026-11-10");
    expect(r[0]).toMatchObject({ level: "crit", debtId: "a" });
  });
  it("warns when the silence period ends within two weeks", () => {
    const r = buildReminders(debts, [neg()], [], "2026-10-30");
    expect(r.some((x) => x.title.includes("silence period ends Nov 6"))).toBe(true);
  });
  it("stays quiet when the silence period is far off", () => {
    const r = buildReminders(debts, [neg()], [], "2026-10-05");
    expect(r.some((x) => x.title.includes("silence"))).toBe(false);
  });
  it("flags a creditor offer about to expire", () => {
    const r = buildReminders(debts, [], [{ debtId: "b", party: "creditor", madeOn: "2026-10-02", expiresOn: "2026-10-08", amountCents: 650_000 }], "2026-10-05");
    expect(r[0]).toMatchObject({ level: "crit", debtId: "b" });
  });
  it("ignores an old offer once a newer one from us exists", () => {
    const r = buildReminders(
      debts,
      [],
      [
        { debtId: "b", party: "creditor", madeOn: "2026-10-02", expiresOn: "2026-10-08", amountCents: 650_000 },
        { debtId: "b", party: "us", madeOn: "2026-10-04", expiresOn: null, amountCents: 500_000 },
      ],
      "2026-10-05",
    );
    expect(r.some((x) => x.title.includes("counter-offer"))).toBe(false);
  });
  it("puts overdue actions first", () => {
    const r = buildReminders(debts, [neg({ nextActionOn: "2026-10-01", nextActionNote: "Call settlement team" })], [], "2026-10-05");
    expect(r[0].title).toContain("Call settlement team");
    expect(r[0].level).toBe("crit");
  });
});

const settled: CalBundle = {
  id: "h",
  name: "HBJ",
  debt: { originalCents: 15_500_000, rateBps: null, status: "settled", monthlyPaymentCents: null, paymentDay: null },
  settlement: { agreedCents: 5_000_000, installmentCents: 138_889, installments: 36, agreedOn: "2025-12-20", firstPaymentOn: "2026-01-15" },
  payments: [{ paidOn: "2026-01-15", amountCents: 138_889, interestCents: 0 }],
};
const sba: CalBundle = {
  id: "s",
  name: "SBA",
  debt: { originalCents: 15_000_000, rateBps: 375, status: "kept", monthlyPaymentCents: 75_000, paymentDay: 20 },
  settlement: null,
  payments: [],
};

describe("calendar", () => {
  const income = [{ name: "Salary", amountCents: 210_000, dayOfMonth: 1 }];
  it("lists income, a paid payment and a late installment", () => {
    const jan = monthEvents([settled], income, "2026-01", "2026-10-05");
    expect(jan.map((e) => e.kind).sort()).toEqual(["income", "paid"]);
    const feb = monthEvents([settled], income, "2026-02", "2026-10-05");
    expect(feb.find((e) => e.label === "HBJ")?.kind).toBe("late");
  });
  it("marks future installments as due", () => {
    const nov = monthEvents([settled], [], "2026-11", "2026-10-05");
    expect(nov).toEqual([expect.objectContaining({ kind: "due", date: "2026-11-15" })]);
  });
  it("schedules regular monthly payments only from the current month", () => {
    expect(monthEvents([sba], [], "2026-09", "2026-10-05")).toHaveLength(0);
    expect(monthEvents([sba], [], "2026-10", "2026-10-05")[0]).toMatchObject({ kind: "due", date: "2026-10-20" });
  });
  it("totals the month", () => {
    const t = monthTotals(monthEvents([settled, sba], income, "2026-11", "2026-10-05"));
    expect(t).toEqual({ income: 210_000, paid: 0, toPay: 138_889 + 75_000, leftAfter: 210_000 - 138_889 - 75_000 });
  });
  it("shifts months", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
