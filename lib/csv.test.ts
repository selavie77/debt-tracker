import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";

describe("csv", () => {
  it("handles quotes and commas inside fields", () => {
    expect(parseCsv('name,amount\n"Smith, Inc.","1,200"\n')).toEqual([["name", "amount"], ["Smith, Inc.", "1,200"]]);
  });
  it("handles tabs pasted from a spreadsheet", () => {
    expect(parseCsv("a\tb\r\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("normalizes headers", () => {
    expect(toRecords(parseCsv("Entity,Payment Day\nMe,5"))).toEqual([{ entity: "Me", payment_day: "5" }]);
  });
});
