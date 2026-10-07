import type { DebtStatus, DebtType } from "./db/schema";

export const TYPE_LABEL: Record<DebtType, string> = {
  federal_tax: "Federal back taxes",
  state_tax: "State back taxes",
  other_tax: "Other back taxes (payroll, local, property)",
  business_loan: "Business loan",
  government_loan: "Government loan",
  credit_card: "Credit card",
  auto_loan: "Auto loan",
  mortgage: "Mortgage",
  secured: "Other secured, asset-backed",
  student_loan: "Student loan",
  personal_loan: "Personal loan",
  line_of_credit: "Line of credit",
  medical: "Medical debt",
  other: "Other",
};

/** Back taxes of any kind. These follow different rules from loans, so they are handled separately. */
export function isTaxDebtType(type: DebtType): boolean {
  return type === "federal_tax" || type === "state_tax" || type === "other_tax";
}

// Extra wordings accepted when importing a spreadsheet, besides each type's id and label.
const TYPE_ALIASES: Record<string, DebtType> = {
  "federal tax": "federal_tax", "federal taxes": "federal_tax", "federal back tax": "federal_tax", irs: "federal_tax",
  "state tax": "state_tax", "state taxes": "state_tax", "state back tax": "state_tax",
  "payroll tax": "other_tax", "payroll taxes": "other_tax", "back taxes": "other_tax", "back tax": "other_tax",
  "property tax": "other_tax", "local tax": "other_tax",
  "car loan": "auto_loan", auto: "auto_loan", "vehicle loan": "auto_loan",
  "medical debt": "medical", heloc: "line_of_credit", secured: "secured",
};

/** Match imported text to a debt type by id, label or common wording. Unknown text becomes "other". */
export function parseDebtType(text: string | undefined): DebtType {
  const t = (text ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (!t) return "other";
  for (const [id, label] of Object.entries(TYPE_LABEL) as [DebtType, string][]) {
    if (t === id.replace(/_/g, " ") || t === label.toLowerCase()) return id;
  }
  return TYPE_ALIASES[t] ?? "other";
}

export const STATUS_LABEL: Record<DebtStatus, string> = {
  active: "Active",
  negotiating: "Negotiating",
  settled: "Paying settlement",
  paid: "Paid",
  kept: "Kept",
};

export const STATUS_CLASS: Record<DebtStatus, string> = {
  active: "c-neutral",
  negotiating: "c-neg",
  settled: "c-paying",
  paid: "c-paid",
  kept: "c-kept",
};
