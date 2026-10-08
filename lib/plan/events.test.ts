import { describe, expect, it } from "vitest";
import { allocatePayoffs, eventsInMonth, expectedEventCents, fullEventCents, happensInExpected, monthsBetween, parseEvent, type EventLike } from "./events";
import { evaluatePayoffs, suggestPayoffs, type PayoffCandidate } from "./payoff";

const sale: EventLike = { direction: "in", amountCents: 15_000_000, expectedMonth: "2027-03-01", confidencePercent: 60 };

describe("one-time events", () => {
  it("counts money in as happening, in full, from 50% sure, and not at all below that", () => {
    expect(happensInExpected({ ...sale, confidencePercent: 50 })).toBe(true);
    expect(happensInExpected({ ...sale, confidencePercent: 49 })).toBe(false);
    expect(expectedEventCents(sale)).toBe(15_000_000); // 60% sure: counted in full, not scaled
    expect(expectedEventCents({ ...sale, confidencePercent: 30 })).toBe(0);
  });
  it("counts money going out from 25% sure, so a possible bill is not ignored", () => {
    const bill: EventLike = { ...sale, direction: "out", amountCents: 500_000 };
    expect(happensInExpected({ ...bill, confidencePercent: 25 })).toBe(true);
    expect(happensInExpected({ ...bill, confidencePercent: 24 })).toBe(false);
    expect(expectedEventCents({ ...bill, confidencePercent: 40 })).toBe(-500_000);
    expect(fullEventCents(bill)).toBe(-500_000);
  });
  it("the full amount counts whatever the confidence", () => {
    expect(fullEventCents({ ...sale, confidencePercent: 5 })).toBe(15_000_000);
  });
  it("finds events by month", () => {
    expect(eventsInMonth([sale], "2027-03")).toHaveLength(1);
    expect(eventsInMonth([sale], "2027-04")).toHaveLength(0);
  });
  it("counts months between", () => {
    expect(monthsBetween("2026-10", "2027-03")).toBe(5);
    expect(monthsBetween("2026-10", "2026-10")).toBe(0);
  });
});

describe("paying debts off from money that may not cover them all", () => {
  const costs: Record<string, number> = { fed: 11_500_000, state: 2_000_000, car: 2_500_000 };
  const cost = (id: string) => costs[id];
  it("pays in the order given while each one fits, and reports what is left", () => {
    const r = allocatePayoffs(15_000_000, ["fed", "car", "state"], cost);
    expect(r.paid).toEqual([{ debtId: "fed", costCents: 11_500_000 }, { debtId: "car", costCents: 2_500_000 }]);
    expect(r.notCovered).toEqual([{ debtId: "state", costCents: 2_000_000 }]);
    expect(r.leftCents).toBe(1_000_000);
  });
  it("skips a debt that does not fit and still tries the next one", () => {
    const r = allocatePayoffs(3_000_000, ["fed", "car", "state"], cost);
    expect(r.paid.map((p) => p.debtId)).toEqual(["car"]);
    expect(r.notCovered.map((p) => p.debtId)).toEqual(["fed", "state"]); // $115,000 and $20,000 do not fit in $30,000 less $25,000
    expect(r.leftCents).toBe(500_000);
  });
  it("covers everything when there is enough, and nothing when there is not", () => {
    expect(allocatePayoffs(20_000_000, ["fed", "car", "state"], cost)).toMatchObject({ notCovered: [], leftCents: 4_000_000 });
    expect(allocatePayoffs(1_000_000, ["fed", "car", "state"], cost).paid).toEqual([]);
  });
  it("skips debts that an earlier event already paid off", () => {
    const r = allocatePayoffs(15_000_000, ["fed", "car"], cost, new Set(["fed"]));
    expect(r.paid.map((p) => p.debtId)).toEqual(["car"]);
    expect(r.leftCents).toBe(12_500_000);
  });
});
describe("parseEvent", () => {
  const ok = { name: " Sale of the property ", direction: "in", amount: "150,000", month: "2027-03", confidence: "60", note: " net of costs ", debtIds: ["tax", "auto", "tax", ""] };
  it("accepts a valid event and names the debts it pays off, once each", () => {
    expect(parseEvent(ok)).toEqual({
      row: { name: "Sale of the property", direction: "in", amountCents: 15_000_000, expectedMonth: "2027-03-01", confidencePercent: 60, note: "net of costs", payoffDebtIds: ["tax", "auto"] },
    });
  });
  it("money going out never pays off debts", () => {
    expect(parseEvent({ ...ok, direction: "out" })).toMatchObject({ row: { direction: "out", payoffDebtIds: [] } });
  });
  it("rejects bad input with a clear message", () => {
    expect(parseEvent({ ...ok, name: "" })).toMatchObject({ error: expect.stringContaining("what it is") });
    expect(parseEvent({ ...ok, direction: "sideways" })).toMatchObject({ error: expect.stringContaining("comes in or goes out") });
    expect(parseEvent({ ...ok, amount: "0" })).toMatchObject({ error: expect.stringContaining("dollar amount") });
    expect(parseEvent({ ...ok, month: "March" })).toEqual({ error: "Choose the month you expect it" });
    for (const c of ["0", "101", "x", ""]) expect(parseEvent({ ...ok, confidence: c })).toEqual({ error: "Enter your confidence as a number from 1 to 100" });
  });
});

const debt = (id: string, owed: number, rate: number | null, monthly: number, tier: 1 | 2 | 3 = 3, settled = false): PayoffCandidate => ({
  id, name: id, owedCents: owed, rateBps: rate, monthlyCents: monthly, tier, settled,
});
const debts = [
  debt("card", 1_000_000, 2400, 30_000),
  debt("auto", 1_200_000, 700, 50_000, 1),
  debt("taxes", 4_000_000, null, 0, 1),
  debt("loan", 2_000_000, 1200, 60_000, 2),
  debt("settled", 500_000, null, 100_000, 3, true),
];

describe("payoff suggestions", () => {
  it("totals what paying chosen debts off would do", () => {
    expect(evaluatePayoffs(debts, ["card", "auto"], 5_000_000)).toEqual({ ids: ["card", "auto"], usedCents: 2_200_000, leftCents: 2_800_000, interestPerYearSavedCents: 240_000 + 84_000, monthlyFreedCents: 80_000 });
  });
  it("paying a settled debt early saves no interest but frees its payment", () => {
    expect(evaluatePayoffs(debts, ["settled"], 1_000_000)).toMatchObject({ interestPerYearSavedCents: 0, monthlyFreedCents: 100_000 });
  });
  it("highest rate first, whole debts only, skipping ones that do not fit", () => {
    const r = suggestPayoffs(debts, 3_300_000, "rate");
    // card (24%, $10,000) then loan (12%, $20,000) fit; auto ($12,000), settled ($5,000) and taxes ($40,000) do not fit in the $3,000 left
    expect(r.ids).toEqual(["card", "loan"]);
    expect(r).toMatchObject({ usedCents: 3_000_000, leftCents: 300_000 });
  });  it("most serious first by tier", () => {
    const r = suggestPayoffs(debts, 5_300_000, "tier");
    expect(r.ids.slice(0, 2)).toEqual(["auto", "taxes"]); // tier 1, higher rate first (auto 7%, taxes 0%)
  });
  it("pays nothing off with no money", () => {
    expect(suggestPayoffs(debts, 0, "rate")).toMatchObject({ ids: [], usedCents: 0, leftCents: 0 });
  });
});
