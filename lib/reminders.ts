import { eq } from "drizzle-orm";
import { pool, runAsUser, type Db } from "./db";
import { notificationPrefs, reminderSent } from "./db/schema";
import { todayISO } from "./dates";
import type { SendResult } from "./email";
import { buildReminders, isTimeSensitive, pickNew, reminderKey, type Reminder } from "./negotiation";
import { listDebts, listNegotiations, listOffers } from "./queries";
import { buildDigest } from "./reminder-email";

/** Every current reminder for the user behind `db`. */
export async function loadReminders(db: Db, today = todayISO()): Promise<Reminder[]> {
  const [debts, negs, offers] = await Promise.all([listDebts(db), listNegotiations(db), listOffers(db)]);
  return buildReminders(
    debts.map((d) => ({ id: d.debt.id, name: d.debt.name, status: d.debt.status, owedCents: d.owed, delinquentSince: d.debt.delinquentSince })),
    negs,
    offers,
    today,
  );
}

export type JobResult = { optedIn: number; emailed: number; nothingNew: number; failed: number };
type Send = (msg: { to: string; subject: string; html: string; text: string }) => Promise<SendResult>;

/**
 * Daily job. For every user who turned email reminders on and has not been emailed today:
 * work out their reminders (as that user, so row-level security applies), email them if anything
 * new needs attention, then record what was sent so it is not repeated.
 */
export async function runReminderJob(send: Send, today = todayISO(), only?: string[]): Promise<JobResult> {
  const { rows: users } = await pool.query<{ id: string; email: string }>(
    `select p.owner_id as id, u.email
       from notification_prefs p join auth.users u on u.id = p.owner_id
      where p.email_reminders and u.email is not null and (p.last_sent_on is null or p.last_sent_on < $1)
        and ($2::uuid[] is null or p.owner_id = any($2::uuid[]))`,
    [today, only ?? null],
  );
  const result: JobResult = { optedIn: users.length, emailed: 0, nothingNew: 0, failed: 0 };

  for (const user of users) {
    try {
      const plan = await runAsUser(user.id, async (db) => {
        const all = await loadReminders(db, today);
        const keys = new Set((await db.select({ key: reminderSent.key }).from(reminderSent)).map((r) => r.key));
        return pickNew(all, keys, today).length ? all : null;
      });
      if (!plan) {
        result.nothingNew++;
        continue;
      }
      const digest = buildDigest(plan);
      const sent = await send({ to: user.email, subject: digest.subject, html: digest.html, text: digest.text });
      if (!sent.ok) {
        result.failed++;
        continue;
      }
      await runAsUser(user.id, async (db) => {
        const rows = plan.filter(isTimeSensitive).map((r) => ({ key: reminderKey(r, today), sentOn: today }));
        if (rows.length) await db.insert(reminderSent).values(rows).onConflictDoNothing();
        await db.update(notificationPrefs).set({ lastSentOn: today }).where(eq(notificationPrefs.ownerId, user.id));
      });
      result.emailed++;
    } catch {
      result.failed++; // one user's problem must not stop the others
    }
  }
  return result;
}
