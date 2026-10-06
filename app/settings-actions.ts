"use server";

import { revalidatePath } from "next/cache";
import { requireUser, runAsUser, withUser } from "@/lib/db";
import { notificationPrefs, reminderSent } from "@/lib/db/schema";
import { todayISO } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { loadReminders } from "@/lib/reminders";
import { buildDigest } from "@/lib/reminder-email";
import type { FormState } from "./actions";

export async function saveReminderPrefs(_: FormState, fd: FormData): Promise<FormState> {
  const on = fd.get("emailReminders") === "on";
  await withUser((db) =>
    db.insert(notificationPrefs).values({ emailReminders: on }).onConflictDoUpdate({ target: notificationPrefs.ownerId, set: { emailReminders: on } }),
  );
  revalidatePath("/settings");
  return { ok: on ? "Email reminders are on" : "Email reminders are off" };
}

/** Sends the current reminders (or a "nothing to report" note) to the signed-in user, ignoring the daily limit. */
export async function sendTestReminder(): Promise<FormState> {
  const user = await requireUser();
  if (!user.email) return { error: "Your account has no email address" };

  const gate = await runAsUser(user.id, async (db) => {
    const [prefs] = await db.select().from(notificationPrefs);
    const last = prefs?.lastTestAt ? Date.parse(prefs.lastTestAt) : 0;
    if (Date.now() - last < 60_000) return { wait: true as const };
    await db
      .insert(notificationPrefs)
      .values({ lastTestAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: notificationPrefs.ownerId, set: { lastTestAt: new Date().toISOString() } });
    return { wait: false as const, reminders: await loadReminders(db, todayISO()) };
  });
  if (gate.wait) return { error: "A test email was just sent. Wait a minute and try again." };

  const digest = buildDigest(gate.reminders, { test: true });
  const sent = await sendEmail({ to: user.email, subject: digest.subject, html: digest.html, text: digest.text });
  return sent.ok ? { ok: `Test email sent to ${user.email}. It can take a minute to arrive.` } : { error: sent.error };
}

export async function resetSentReminders(): Promise<FormState> {
  await withUser(async (db) => {
    await db.delete(reminderSent); // row-level security limits this to the signed-in user's rows
    await db.update(notificationPrefs).set({ lastSentOn: null });
  });
  revalidatePath("/settings");
  return { ok: "Cleared. The next daily check can email current items again." };
}
