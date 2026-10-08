"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { debts, entities, income, plannedEventDebts, plannedEvents, planSettings } from "@/lib/db/schema";
import { parseIncome } from "@/lib/income";
import { toCents } from "@/lib/money";
import { parseEvent } from "@/lib/plan/events";
import type { FormState } from "./actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => {
  revalidatePath("/expect");
  revalidatePath("/plan");
  revalidatePath("/calendar");
  revalidatePath("/living-costs");
};

/** A business income forecast: a monthly amount, a confidence level, and the months it applies to. */
export async function addForecast(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseIncome({
    name: str(fd, "name"), amount: str(fd, "amount"), schedule: "", day: "", day2: "",
    kind: "variable", confidence: str(fd, "confidence"), start: str(fd, "start"), duration: str(fd, "duration"), entityId: str(fd, "entityId"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const row = parsed.rows[0];
  const result = await withUser(async (db): Promise<FormState> => {
    if (row.entityId) {
      // Row-level security only returns the user's own entities, so this also checks it is theirs.
      const [owned] = await db.select({ id: entities.id }).from(entities).where(eq(entities.id, row.entityId));
      if (!owned) return { error: "Choose one of your own businesses, or leave it unlinked" };
    }
    await db.insert(income).values(row);
    return { ok: `Added ${row.name}` };
  });
  refresh();
  return result;
}

export async function deleteForecast(id: string) {
  await withUser((db) => db.delete(income).where(eq(income.id, id)));
  refresh();
}

/** A one-time event: money coming in or going out in a month, with a confidence level, and the debts it pays off. */
export async function addEvent(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseEvent({
    name: str(fd, "name"), direction: str(fd, "direction"), amount: str(fd, "amount"), month: str(fd, "month"),
    confidence: str(fd, "confidence"), note: str(fd, "note"), debtIds: fd.getAll("debtId").map(String),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { payoffDebtIds, ...row } = parsed.row;
  const result = await withUser(async (db): Promise<FormState> => {
    // Only the user's own debts come back, so any other id is dropped.
    const valid = payoffDebtIds.length ? (await db.select({ id: debts.id }).from(debts).where(inArray(debts.id, payoffDebtIds))).map((d) => d.id) : [];
    const [created] = await db.insert(plannedEvents).values(row).returning({ id: plannedEvents.id });
    if (valid.length) await db.insert(plannedEventDebts).values(valid.map((debtId) => ({ eventId: created.id, debtId })));
    return { ok: `Added ${row.name}` };
  });
  refresh();
  return result;
}

export async function deleteEvent(id: string) {
  await withUser((db) => db.delete(plannedEvents).where(eq(plannedEvents.id, id))); // its debt links go with it
  refresh();
}

/** Cash and savings available today. Empty clears it. */
export async function saveCashOnHand(_: FormState, fd: FormData): Promise<FormState> {
  const raw = str(fd, "cash");
  let cents: number | null = null;
  if (raw !== "") {
    cents = toCents(raw);
    if (!Number.isFinite(cents) || cents < 0) return { error: "Enter a dollar amount like 8,000" };
  }
  await withUser((db) =>
    db.insert(planSettings).values({ cashOnHandCents: cents }).onConflictDoUpdate({ target: planSettings.ownerId, set: { cashOnHandCents: cents } }),
  );
  refresh();
  return { ok: cents == null ? "Cleared" : "Saved" };
}
