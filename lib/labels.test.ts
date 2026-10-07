import { describe, expect, it } from "vitest";
import { compareColumn } from "./compare";
import { DEBT_TYPES, type Debt, type Entity } from "./db/schema";
import { balanceAt, eliminated, totalPaid } from "./finance";
import { TYPE_LABEL, isTaxDebtType, parseDebtType } from "./labels";
import type { DebtFull } from "./queries";
import { taxFlags } from "./tax";

describe("debt types", () => {
  it("every type has a label", () => {
    for (const t of DEBT_TYPES) expect(TYPE_LABEL[t]).toBeTruthy();
  });
  it("offers the back taxes and auto loan options by name", () => {
    expect(TYPE_LABEL.federal_tax).toBe("Federal back taxes");
    expect(TYPE_LABEL.state_tax).toBe("State back taxes");
    expect(TYPE_LABEL.auto_loan).toBe("Auto loan");
    expect(TYPE_LABEL.other_tax).toMatch(/Other back taxes/);
  });
  it("treats all back taxes as tax debts", () => {
    expect(["federal_tax", "state_tax", "other_tax"].every((t) => isTaxDebtType(t as never))).toBe(true);
    expect(isTaxDebtType("auto_loan")).toBe(false);
  });
});

describe("parsing imported types", () => {
  it.each([
    ["Federal back taxes", "federal_tax"],
    ["federal_tax", "federal_tax"],
    ["Federal tax", "federal_tax"],
    ["IRS", "federal_tax"],
    ["State Back Taxes", "state_tax"],
    ["payroll taxes", "other_tax"],
    ["Back taxes", "other_tax"],
    ["Auto loan", "auto_loan"],
    ["car loan", "auto_loan"],
    ["Credit card", "credit_card"],
    ["credit_card", "credit_card"],
    ["Mortgage", "mortgage"],
    ["Student loan", "student_loan"],
    ["Medical debt", "medical"],
    ["HELOC", "line_of_credit"],
    ["Other secured, asset-backed", "secured"],
    ["something unknown", "other"],
    ["", "other"],
  ])("%s -> %s", (input, expected) => expect(parseDebtType(input)).toBe(expected));
});

const entity: Entity = { id: "e", ownerId: "u", name: "Biz", kind: "business", isExample: false, createdAt: "" };
function full(type: Debt["type"], agreed: number | null): DebtFull {
  const debt: Debt = {
    id: "d", ownerId: "u", entityId: "e", name: "X", creditor: "", type, originalCents: 1_000_000, rateBps: null, collateral: "",
    personalGuarantee: false, government: false, status: "active", delinquentSince: null, monthlyPaymentCents: null, paymentDay: null,
    notes: "", isExample: false, createdAt: "2026-01-01",
  };
  const settlement = agreed == null ? null : { id: "s", ownerId: "u", debtId: "d", agreedCents: agreed, installmentCents: agreed, installments: 1, agreedOn: "2026-02-01", firstPaymentOn: "2026-03-01", notes: "", createdAt: "" };
  const bundle = { debt, settlement, payments: [] as never[] };
  return { ...bundle, entity, owed: balanceAt(bundle, "2026-10-05"), eliminated: eliminated(bundle), paid: totalPaid(bundle), target: agreed ?? debt.originalCents };
}

describe("where the new types change behavior", () => {
  it("a reduced 'other back taxes' debt is a tax debt, not forgiven-loan income", () => {
    const flags = taxFlags([full("other_tax", 300_000)]);
    expect(flags[0].kind).toBe("tax_debt");
    expect(flags[0].mayGetForm).toBe(false);
  });
  it("a reduced auto loan is treated like other settled loans", () => {
    expect(taxFlags([full("auto_loan", 300_000)])[0].kind).toBe("cancellation");
  });
  it("auto loans and mortgages get a secured-debt check even without collateral text", () => {
    expect(compareColumn(full("auto_loan", null), null, "2026-10-05").checks.join(" ")).toMatch(/repossession/);
    expect(compareColumn(full("mortgage", null), null, "2026-10-05").checks.join(" ")).toMatch(/foreclosure/);
  });
  it("back taxes point to the agency's own guidance", () => {
    expect(compareColumn(full("other_tax", null), null, "2026-10-05").checks.join(" ")).toMatch(/agency/);
  });
});
