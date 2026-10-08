import { describe, expect, it } from "vitest";
import { parseIncome } from "./income";

const base = { name: "Paycheck", amount: "2,100.50", schedule: "twice", day: "15", day2: "31" };
const steady = { kind: "steady", entityId: null, confidencePercent: null, startsOn: null, endsOn: null };

describe("income form: paychecks", () => {
  it("twice a month makes two rows: the 15th and the last day", () => {
    expect(parseIncome(base)).toEqual({
      rows: [
        { name: "Paycheck", amountCents: 210_050, dayOfMonth: 15, ...steady },
        { name: "Paycheck", amountCents: 210_050, dayOfMonth: 31, ...steady },
      ],
    });
  });
  it("orders the pay days whichever way they were entered", () => {
    const r = parseIncome({ ...base, day: "31", day2: "15" });
    expect("rows" in r && r.rows.map((x) => x.dayOfMonth)).toEqual([15, 31]);
  });
  it("once a month makes one row and ignores the second day", () => {
    expect(parseIncome({ ...base, schedule: "monthly", day: "1", day2: "" })).toEqual({ rows: [{ name: "Paycheck", amountCents: 210_050, dayOfMonth: 1, ...steady }] });
  });
  it("rejects bad input with a clear message", () => {
    expect(parseIncome({ ...base, name: " " })).toEqual({ error: "Enter a name" });
    expect(parseIncome({ ...base, amount: "abc" })).toMatchObject({ error: expect.stringContaining("dollar amount") });
    expect(parseIncome({ ...base, amount: "0" })).toMatchObject({ error: expect.stringContaining("dollar amount") });
    expect(parseIncome({ ...base, day: "" })).toEqual({ error: "Choose a pay day" });
    expect(parseIncome({ ...base, day: "32" })).toEqual({ error: "Choose a pay day" });
    expect(parseIncome({ ...base, day2: "" })).toEqual({ error: "Choose the second pay day" });
    expect(parseIncome({ ...base, day2: "15" })).toEqual({ error: "The two pay days must be different" });
  });
});

describe("income form: business forecast", () => {
  const biz = { name: "Side business", amount: "10,000", schedule: "", day: "", day2: "", kind: "variable", confidence: "60", start: "2026-11", duration: "12", entityId: "ent-1" };
  it("makes one row with a confidence level, a period and the business it comes from", () => {
    expect(parseIncome(biz)).toEqual({
      rows: [{ name: "Side business", amountCents: 1_000_000, dayOfMonth: 31, kind: "variable", entityId: "ent-1", confidencePercent: 60, startsOn: "2026-11-01", endsOn: "2027-10-31" }],
    });
  });
  it("works out the end of each period, across year ends and leap years", () => {
    const ends = (start: string, duration: string) => {
      const r = parseIncome({ ...biz, start, duration });
      return "rows" in r ? r.rows[0].endsOn : r.error;
    };
    expect(ends("2026-11", "3")).toBe("2027-01-31");
    expect(ends("2026-01", "36")).toBe("2028-12-31");
    expect(ends("2027-12", "3")).toBe("2028-02-29"); // leap year
    expect(ends("2026-11", "ongoing")).toBeNull();
  });
  it("accepts a trailing percent sign, and no business entity", () => {
    expect(parseIncome({ ...biz, confidence: "75%", entityId: "" })).toMatchObject({ rows: [{ confidencePercent: 75, entityId: null }] });
  });
  it("rejects a confidence outside 1 to 100, a bad month or a bad duration", () => {
    for (const c of ["0", "101", "abc", "", "-5", "50.5"]) expect(parseIncome({ ...biz, confidence: c })).toEqual({ error: "Enter your confidence as a number from 1 to 100" });
    expect(parseIncome({ ...biz, start: "" })).toEqual({ error: "Choose the first month it applies to" });
    expect(parseIncome({ ...biz, start: "2026-13" })).toEqual({ error: "Choose the first month it applies to" });
    expect(parseIncome({ ...biz, duration: "7" })).toEqual({ error: "Choose how long it applies for" });
    expect(parseIncome({ ...biz, duration: "" })).toEqual({ error: "Choose how long it applies for" });
  });
});
