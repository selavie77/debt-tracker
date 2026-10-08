"use client";

import { useState } from "react";
import { addIncome } from "@/app/negotiation-actions";
import { ActionForm } from "./ActionForm";

const LAST = 31; // the last day of the month, whatever its length

function DayOptions() {
  return (
    <>
      {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      <option value={LAST}>Last day of the month</option>
    </>
  );
}

/** Paycheck form: once a month, or twice a month (defaults to the 15th and the last day). Business income is on the Expect page. */
export function IncomeForm() {
  const [schedule, setSchedule] = useState<"monthly" | "twice">("twice");
  return (
    <ActionForm action={addIncome} submitLabel="Add paycheck" resetOnSuccess>
      <label>Name<input type="text" id="income-name" name="name" placeholder="Paycheck" required /></label>
      <label>{schedule === "twice" ? "Amount per paycheck ($)" : "Amount ($)"}<input type="text" id="income-amount" inputMode="decimal" name="amount" required /></label>
      <label>How often
        <select id="income-schedule" name="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as "monthly" | "twice")}>
          <option value="twice">Twice a month</option>
          <option value="monthly">Once a month</option>
        </select>
      </label>
      <label>{schedule === "twice" ? "First pay day" : "Pay day"}
        <select id="income-day" name="day" key={`d1-${schedule}`} defaultValue={schedule === "twice" ? 15 : 1}><DayOptions /></select>
      </label>
      {schedule === "twice" && (
        <label>Second pay day
          <select id="income-day2" name="day2" defaultValue={LAST}><DayOptions /></select>
        </label>
      )}
    </ActionForm>
  );
}
