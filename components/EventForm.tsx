"use client";

import { useState } from "react";
import { addEvent } from "@/app/expect-actions";
import { usdWhole } from "@/lib/money";
import { ActionForm } from "./ActionForm";
import { ConfidenceField } from "./ConfidenceField";

type Props = { debts: { id: string; name: string; owedCents: number }[]; defaultMonth: string };

/** Add a one-time event: money coming in or going out, when you expect it, how sure you are, and which debts it would pay off. */
export function EventForm({ debts, defaultMonth }: Props) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  return (
    <ActionForm action={addEvent} submitLabel="Add event" resetOnSuccess>
      <label>What
        <input type="text" id="ev-name" name="name" placeholder="Sale of the property" required />
      </label>
      <label>Money
        <select id="ev-direction" name="direction" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
          <option value="in">Coming in</option>
          <option value="out">Going out</option>
        </select>
      </label>
      <label>{direction === "in" ? "You expect to receive ($)" : "You expect to pay ($)"}
        <input type="text" id="ev-amount" name="amount" inputMode="decimal" placeholder="150,000" required />
      </label>
      <label>Month you expect it
        <input type="month" id="ev-month" name="month" defaultValue={defaultMonth} required />
      </label>
      <ConfidenceField idPrefix="ev" defaultValue={60} hint="How likely it is to happen in that month. The plan counts the amount times this." />
      <label className="wide">Note
        <input type="text" id="ev-note" name="note" placeholder="Net of closing costs and any tax" />
      </label>
      {direction === "in" && debts.length > 0 && (
        <fieldset className="wide" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
          <legend className="note">Debts this would pay off (optional)</legend>
          <div className="picks">
            {debts.map((d) => (
              <label className="pick" key={d.id}>
                <input type="checkbox" name="debtId" value={d.id} /> {d.name} ({usdWhole(d.owedCents)})
              </label>
            ))}
          </div>
          <p className="note" style={{ marginBottom: 0 }}>
            Use the amount you expect to actually receive, after closing costs and any tax. The plan uses today&apos;s balances. The exact payoff amounts will differ, so ask each creditor for one in writing.
          </p>
        </fieldset>
      )}
    </ActionForm>
  );
}
