"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { planSettings } from "@/lib/db/schema";
import { toCents } from "@/lib/money";
import type { FormState } from "./actions";

/** Monthly living costs: rent, food, utilities and other basics. Empty clears it. */
export async function saveLivingCosts(_: FormState, fd: FormData): Promise<FormState> {
  const raw = String(fd.get("living") ?? "").trim();
  let cents: number | null = null;
  if (raw !== "") {
    cents = toCents(raw);
    if (!Number.isFinite(cents) || cents < 0) return { error: "Enter a dollar amount like 2,400" };
  }
  await withUser((db) =>
    db.insert(planSettings).values({ livingCostsCents: cents }).onConflictDoUpdate({ target: planSettings.ownerId, set: { livingCostsCents: cents } }),
  );
  revalidatePath("/plan");
  revalidatePath("/living-costs");
  return { ok: cents == null ? "Cleared" : "Saved" };
}
