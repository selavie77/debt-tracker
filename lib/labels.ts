import type { DebtStatus, DebtType } from "./db/schema";

export const TYPE_LABEL: Record<DebtType, string> = {
  federal_tax: "Federal tax",
  state_tax: "State tax",
  business_loan: "Business loan",
  government_loan: "Government loan",
  credit_card: "Credit card",
  secured: "Secured, asset-backed",
  personal_loan: "Personal loan",
  other: "Other",
};

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
