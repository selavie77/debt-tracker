import { describe, expect, it } from "vitest";
import { parseIncome } from "./income";

const base = { name: "Paycheck", amount: "2,100.50", schedule: "twice", day: "15", day2: "31" };

describe("income form", () => {
  it("twice a month makes two rows: the 15th and the last day", () => {
    expect(parseIncome(base)).toEqual({
      rows: [
        { name: "Paycheck", amountCents: 210_050, dayOfMonth: 15 },
        { name: "Paycheck", amountCents: 210_050, dayOfMonth: 31 },
      ],
    });
  });
  it("orders the pay days whichever way they were entered", () => {
    const r = parseIncome({ ...base, day: "31", day2: "15" });
    expect("rows" in r && r.rows.map((x) => x.dayOfMonth)).toEqual([15, 31]);
  });
  it("once a month makes one row and ignores the second day", () => {
    expect(parseIncome({ ...base, schedule: "monthly", day: "1", day2: "" })).toEqual({ rows: [{ name: "Paycheck", amountCents: 210_050, dayOfMonth: 1 }] });
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
