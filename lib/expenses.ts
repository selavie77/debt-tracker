import type { ExpenseCategory, ExpenseFrequency } from "./db/schema";
import { toCents } from "./money";

// Living costs. Pure functions, so they can be tested without a database.

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  housing: "Housing",
  utilities: "Utilities (electric, gas, water)",
  phone_internet: "Phone and internet",
  subscriptions: "Subscriptions (streaming, apps)",
  transportation: "Transportation (gas, parking, transit)",
  food: "Food and groceries",
  insurance: "Insurance",
  health: "Health and medical",
  family: "Family and childcare",
  personal: "Personal and other",
};

export const FREQUENCY_LABEL: Record<ExpenseFrequency, string> = {
  monthly: "Every month",
  weekly: "Every week",
  biweekly: "Every two weeks",
  quarterly: "Every three months",
  yearly: "Every year",
};

/** Common costs to add in one click. The amount is left for the user to fill in. */
export const PRESETS: { name: string; category: ExpenseCategory; frequency: ExpenseFrequency }[] = [
  { name: "Rent", category: "housing", frequency: "monthly" },
  { name: "Electricity", category: "utilities", frequency: "monthly" },
  { name: "Natural gas / heating", category: "utilities", frequency: "monthly" },
  { name: "Water and sewer", category: "utilities", frequency: "monthly" },
  { name: "Cell phone", category: "phone_internet", frequency: "monthly" },
  { name: "Internet", category: "phone_internet", frequency: "monthly" },
  { name: "Netflix", category: "subscriptions", frequency: "monthly" },
  { name: "Streaming and apps", category: "subscriptions", frequency: "monthly" },
  { name: "Gas for the car", category: "transportation", frequency: "weekly" },
  { name: "Car insurance", category: "insurance", frequency: "monthly" },
  { name: "Groceries", category: "food", frequency: "weekly" },
  { name: "Health insurance", category: "insurance", frequency: "monthly" },
  { name: "Medications", category: "health", frequency: "monthly" },
];

/** What a cost comes to in an average month. Weekly is 52 a year and every-two-weeks is 26 a year. */
export function monthlyCents(amountCents: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case "weekly": return Math.round((amountCents * 52) / 12);
    case "biweekly": return Math.round((amountCents * 26) / 12);
    case "quarterly": return Math.round(amountCents / 3);
    case "yearly": return Math.round(amountCents / 12);
    default: return amountCents;
  }
}

export type ExpenseLike = { name: string; category: ExpenseCategory; amountCents: number; frequency: ExpenseFrequency };

export type CategoryTotal = { category: ExpenseCategory; monthlyCents: number; count: number; percent: number };

export function totalMonthly(items: ExpenseLike[]): number {
  return items.reduce((s, e) => s + monthlyCents(e.amountCents, e.frequency), 0);
}

/** Totals per category, biggest first, with each category's share of the whole. */
export function byCategory(items: ExpenseLike[]): CategoryTotal[] {
  const total = totalMonthly(items);
  const map = new Map<ExpenseCategory, CategoryTotal>();
  for (const e of items) {
    const row = map.get(e.category) ?? { category: e.category, monthlyCents: 0, count: 0, percent: 0 };
    row.monthlyCents += monthlyCents(e.amountCents, e.frequency);
    row.count += 1;
    map.set(e.category, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, percent: total > 0 ? Math.round((r.monthlyCents / total) * 100) : 0 }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/**
 * The living-costs figure the plan uses. Itemized costs win when there are any.
 * Otherwise the single number the user typed, or null if there is neither.
 */
export function effectiveLivingCosts(items: ExpenseLike[], singleCents: number | null): { cents: number | null; source: "itemized" | "single" | "none" } {
  if (items.length > 0) return { cents: totalMonthly(items), source: "itemized" };
  if (singleCents != null) return { cents: singleCents, source: "single" };
  return { cents: null, source: "none" };
}

export type ExpenseInput = { name: string; category: string; amount: string; frequency: string };

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExpenseCategory[];
const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as ExpenseFrequency[];

export function parseExpense(i: ExpenseInput): { error: string } | { row: ExpenseLike } {
  const name = i.name.trim();
  if (!name) return { error: "Enter a name, such as Netflix or Electricity" };
  const amountCents = toCents(i.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter a dollar amount more than zero" };
  const category = CATEGORIES.find((c) => c === i.category);
  if (!category) return { error: "Choose a category" };
  const frequency = FREQUENCIES.find((f) => f === i.frequency);
  if (!frequency) return { error: "Choose how often it is paid" };
  return { row: { name, category, amountCents, frequency } };
}
