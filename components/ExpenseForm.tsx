"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions";
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES, type ExpenseCategory, type ExpenseFrequency } from "@/lib/db/schema";
import { CATEGORY_LABEL, FREQUENCY_LABEL, PRESETS } from "@/lib/expenses";
import { ActionForm } from "./ActionForm";

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  idPrefix: string;
  initial?: { name: string; category: ExpenseCategory; frequency: ExpenseFrequency; amountCents: number };
  presets?: boolean;
};

/** Add or edit one living cost. The preset chips fill in the name, category and how often, leaving the amount to you. */
export function ExpenseForm({ action, submitLabel, idPrefix, initial, presets }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? "personal");
  const [frequency, setFrequency] = useState<ExpenseFrequency>(initial?.frequency ?? "monthly");

  return (
    <div>
      {presets && (
        <div className="picks" style={{ marginBottom: 12 }} aria-label="Quick add">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="pick"
              onClick={() => {
                setName(p.name);
                setCategory(p.category);
                setFrequency(p.frequency);
                document.getElementById(`${idPrefix}-amount`)?.focus();
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={presets}>
        <label>What
          <input type="text" id={`${idPrefix}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix" required />
        </label>
        <label>Category
          <select id={`${idPrefix}-category`} name="category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label>Amount ($)
          <input type="text" id={`${idPrefix}-amount`} name="amount" inputMode="decimal" defaultValue={initial ? String(initial.amountCents / 100) : ""} placeholder="15.99" required />
        </label>
        <label>How often
          <select id={`${idPrefix}-frequency`} name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}>
            {EXPENSE_FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </label>
      </ActionForm>
    </div>
  );
}
