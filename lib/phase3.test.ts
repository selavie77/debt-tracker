import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, toRecords } from "./csv";
import { compareColumn } from "./compare";
import { debtsCsv, groupTotals, paymentsCsv, totals } from "./reports";
import { pendingTaxCount, taxFlags, totalsByYear } from "./tax";
import { balanceAt, eliminated, totalPaid } from "./finance";
import type { Debt, Entity, Payment, Settlement } from "./db/schema";
import type { DebtFull } from "./queries";

const TODAY = "2026-10-05";
const ent = (name: string): Entity => ({ id: name, ownerId: "u", name, kind: "business", createdAt: "" });

function mk(over: Partial<Debt>, settlement: Partial<Settlement> | null = null, pays: Partial<Payment>[] = [], entity = "Biz LLC"): DebtFull {
  const debt: Debt = {
    id: over.name ?? "d", ownerId: "u", entityId: entity, name: "Debt", creditor: "", type: "other", originalCents: 1_000_000,
    rateBps: null, collateral: "", personalGuarantee: false, government: false, status: "active", delinquentSince: null,
    monthlyPaymentCents: null, paymentDay: null, notes: "", createdAt: "2026-01-01", ...over,
  };
  const s: Settlement | null = settlement
    ? { id: "s", ownerId: "u", debtId: debt.id, agreedCents: 300_000, installmentCents: 100_000, installments: 3, agreedOn: "2026-02-01", firstPaymentOn: "2026-03-01", notes: "", createdAt: "", ...settlement }
    : null;
  const payments = pays.map((p, i) => ({ id: String(i), ownerId: "u", debtId: debt.id, paidOn: "2026-03-01", amountCents: 100_000, interestCents: 0, note: "", createdAt: "", ...p })) as Payment[];
  const bundle = { debt, settlement: s, payments };
  return { ...bundle, entity: ent(entity), owed: balanceAt(bundle, TODAY), eliminated: eliminated(bundle), paid: totalPaid(bundle), target: s ? s.agreedCents : debt.originalCents };
}

describe("compare", () => {
  it("computes interest and payoff for a loan with a payment", () => {
    const d = mk({ name: "SBA", type: "government_loan", originalCents: 15_000_000, rateBps: 375, government: true, monthlyPaymentCents: 75_000, paymentDay: 20, status: "kept" });
    const c = compareColumn(d, null, TODAY);
    expect(c.interestPerYearCents).toBe(562_500);
    expect(c.payoffMonths).toBeGreaterThan(300);
    expect(c.checks.join(" ")).toMatch(/hardship/);
    expect(c.checks.join(" ")).toMatch(/Low rate/);
  });
  it("shows no interest cost once a settlement is in place", () => {
    const c = compareColumn(mk({ rateBps: 1700 }, {}), null, TODAY);
    expect(c.interestPerYearCents).toBeNull();
    expect(c.settlementAgreedCents).toBe(300_000);
  });
  it("flags delinquency and secured debt without recommending anything", () => {
    const c = compareColumn(mk({ collateral: "Windows", delinquentSince: "2026-06-01", personalGuarantee: true }), "silence", TODAY);
    expect(c.daysLate).toBe(126);
    expect(c.checks.length).toBeGreaterThanOrEqual(3);
    expect(c.checks.join(" ").toLowerCase()).not.toMatch(/you should|we recommend|stop paying/);
  });
});

describe("tax flags", () => {
  it("flags forgiven amounts of $600 or more and groups by final payment year", () => {
    const a = mk({ name: "A", type: "credit_card" }, {}, [{ paidOn: "2026-03-01" }]);
    const b = mk({ name: "B", type: "business_loan" }, { installments: 24, installmentCents: 12_500, agreedCents: 300_000, firstPaymentOn: "2026-03-01" });
    const flags = taxFlags([a, b]);
    expect(flags).toHaveLength(2);
    expect(flags.every((f) => f.mayGetForm)).toBe(true);
    expect(flags.find((f) => f.debtId === "B")?.year).toBe(2028);
    expect(totalsByYear(flags)).toEqual([
      { year: 2026, forgivenCents: 700_000, count: 1 },
      { year: 2028, forgivenCents: 700_000, count: 1 },
    ]);
  });
  it("treats tax debt settlements separately and skips unsettled debts", () => {
    const t = mk({ name: "IRS", type: "federal_tax" }, {});
    const none = mk({ name: "Plain" });
    const flags = taxFlags([t, none]);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("tax_debt");
    expect(flags[0].mayGetForm).toBe(false);
    expect(totalsByYear(flags)).toEqual([]);
  });
  it("counts items not yet reviewed", () => {
    const flags = taxFlags([mk({ name: "A" }, {}), mk({ name: "B" }, {})]);
    expect(pendingTaxCount(flags, new Set(["A"]))).toBe(1);
  });
});

describe("reports", () => {
  const ds = [mk({ name: "A", type: "credit_card" }, {}, [{}], "Me"), mk({ name: "B", originalCents: 500_000, personalGuarantee: true }, null, [], "Biz LLC")];
  it("totals and groups", () => {
    const t = totals(ds, TODAY);
    expect(t).toMatchObject({ count: 2, originalCents: 1_500_000, eliminatedCents: 700_000, paidCents: 100_000, guaranteedOwedCents: 500_000 });
    const g = groupTotals(ds, (d) => d.entity.name, TODAY);
    expect(g.map((x) => x.key)).toEqual(["Biz LLC", "Me"]);
  });
  it("exports debts in the import format and round-trips", () => {
    const rec = toRecords(parseCsv(debtsCsv(ds)));
    expect(rec[0]).toMatchObject({ entity: "Me", name: "A", type: "credit_card", original: "10000.00", government: "no" });
    expect(Object.keys(rec[0])).toEqual(["entity", "name", "creditor", "type", "original", "rate", "status", "monthly", "payment_day", "collateral", "government", "personal_guarantee"]);
  });
  it("exports payments in the import format", () => {
    expect(toRecords(parseCsv(paymentsCsv(ds)))[0]).toMatchObject({ debt: "A", date: "2026-03-01", amount: "1000.00" });
  });
  it("quotes awkward fields and neutralizes spreadsheet formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", "-5", "plain"]])).toBe(`"a,b","say ""hi""",'=SUM(A1),-5,plain\r\n`);
  });
});
