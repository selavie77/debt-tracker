import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from "./db/schema";
import { CATEGORY_LABEL, FREQUENCY_LABEL, PRESETS, byCategory, effectiveLivingCosts, monthlyCents, parseExpense, totalMonthly, type ExpenseLike } from "./expenses";

describe("monthly equivalents", () => {
  it("converts each frequency to an average month", () => {
    expect(monthlyCents(1_500, "monthly")).toBe(1_500);
    expect(monthlyCents(10_000, "weekly")).toBe(43_333); // 52 weeks / 12 months
    expect(monthlyCents(10_000, "biweekly")).toBe(21_667); // 26 payments / 12 months
    expect(monthlyCents(30_000, "quarterly")).toBe(10_000);
    expect(monthlyCents(120_000, "yearly")).toBe(10_000);
  });
});

const items: ExpenseLike[] = [
  { name: "Rent", category: "housing", amountCents: 150_000, frequency: "monthly" },
  { name: "Electricity", category: "utilities", amountCents: 12_000, frequency: "monthly" },
  { name: "Netflix", category: "subscriptions", amountCents: 1_599, frequency: "monthly" },
  { name: "Spotify", category: "subscriptions", amountCents: 1_099, frequency: "monthly" },
  { name: "Gas for the car", category: "transportation", amountCents: 5_000, frequency: "weekly" },
  { name: "Car registration", category: "transportation", amountCents: 12_000, frequency: "yearly" },
];

describe("totals", () => {
  it("adds every cost at its monthly equivalent", () => {
    // $1,500 rent + $120 electricity + $15.99 + $10.99 subscriptions + $50 a week of gas + $120 a year of registration ($10 a month)
    expect(totalMonthly(items)).toBe(150_000 + 12_000 + 1_599 + 1_099 + 21_667 + 1_000);
  });
  it("groups by category, biggest first, with shares that add up to about 100", () => {
    const rows = byCategory(items);
    expect(rows.map((r) => r.category)).toEqual(["housing", "transportation", "utilities", "subscriptions"]);
    expect(rows.find((r) => r.category === "subscriptions")).toMatchObject({ monthlyCents: 2_698, count: 2 });
    expect(rows.reduce((s, r) => s + r.percent, 0)).toBeGreaterThanOrEqual(99);
    expect(rows.reduce((s, r) => s + r.percent, 0)).toBeLessThanOrEqual(101);
  });
  it("handles no costs", () => {
    expect(totalMonthly([])).toBe(0);
    expect(byCategory([])).toEqual([]);
  });
});

describe("which figure the plan uses", () => {
  it("prefers itemized costs when there are any", () => {
    expect(effectiveLivingCosts(items, 200_000)).toEqual({ cents: totalMonthly(items), source: "itemized" });
  });
  it("falls back to the single number, then to nothing", () => {
    expect(effectiveLivingCosts([], 240_000)).toEqual({ cents: 240_000, source: "single" });
    expect(effectiveLivingCosts([], 0)).toEqual({ cents: 0, source: "single" });
    expect(effectiveLivingCosts([], null)).toEqual({ cents: null, source: "none" });
  });
});

describe("parseExpense", () => {
  const ok = { name: " Netflix ", category: "subscriptions", amount: "15.99", frequency: "monthly" };
  it("accepts a valid cost", () => {
    expect(parseExpense(ok)).toEqual({ row: { name: "Netflix", category: "subscriptions", amountCents: 1_599, frequency: "monthly" } });
  });
  it("rejects bad input with a clear message", () => {
    expect(parseExpense({ ...ok, name: "" })).toMatchObject({ error: expect.stringContaining("name") });
    expect(parseExpense({ ...ok, amount: "free" })).toMatchObject({ error: expect.stringContaining("dollar amount") });
    expect(parseExpense({ ...ok, amount: "0" })).toMatchObject({ error: expect.stringContaining("dollar amount") });
    expect(parseExpense({ ...ok, category: "yacht" })).toEqual({ error: "Choose a category" });
    expect(parseExpense({ ...ok, frequency: "daily" })).toEqual({ error: "Choose how often it is paid" });
  });
});

describe("labels and presets", () => {
  it("has a label for every category and frequency", () => {
    for (const c of EXPENSE_CATEGORIES) expect(CATEGORY_LABEL[c]).toBeTruthy();
    for (const f of EXPENSE_FREQUENCIES) expect(FREQUENCY_LABEL[f]).toBeTruthy();
  });
  it("only offers presets that use real categories and frequencies", () => {
    for (const p of PRESETS) {
      expect(EXPENSE_CATEGORIES).toContain(p.category);
      expect(EXPENSE_FREQUENCIES).toContain(p.frequency);
    }
    expect(PRESETS.map((p) => p.name)).toEqual(expect.arrayContaining(["Netflix", "Cell phone", "Electricity", "Gas for the car"]));
  });
});
