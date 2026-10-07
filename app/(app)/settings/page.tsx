import { eq } from "drizzle-orm";
import { clearExampleData } from "@/app/actions";
import { resetSentReminders, saveReminderPrefs, sendTestReminder } from "@/app/settings-actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Bits";
import { ActionButton } from "@/components/TestEmailButton";
import { fmtDate } from "@/lib/dates";
import { requireUser, withUser } from "@/lib/db";
import { debts, notificationPrefs } from "@/lib/db/schema";
import { emailConfigured } from "@/lib/email";
import { exampleSummary } from "@/lib/example-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const { prefs, example, realDebts } = await withUser(async (db) => ({
    prefs: (await db.select().from(notificationPrefs))[0] ?? null,
    example: await exampleSummary(db),
    realDebts: (await db.select({ id: debts.id }).from(debts).where(eq(debts.isExample, false))).length,
  }));
  const configured = emailConfigured();

  return (
    <>
      <PageHead title="Settings" sub="Your account and email reminders." />

      <div className="panel">
        <h2>Account</h2>
        <div className="list">
          <div className="item"><span className="note">Signed in as</span><span>{user.email}</span></div>
        </div>
      </div>

      {example.total > 0 && (
        <div className="panel" id="example">
          <h2>Example data</h2>
          <p>
            Your account has example data from the book: {example.debts.length} debts, {example.entities.length} entities and {example.incomeCount} income entries. Clear it before you enter your own debts so the totals show only real numbers.
          </p>
          <p className="note">
            {realDebts > 0
              ? `Your ${realDebts} real ${realDebts === 1 ? "debt is" : "debts are"} not affected. Only the example rows are removed.`
              : "You have no real debts yet. After clearing, the dashboard will be empty and ready for your own."}
          </p>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Clear example data...</summary>
            <div style={{ marginTop: 12 }}>
              <p className="note">This permanently deletes these debts and everything attached to them (payments, settlements, negotiations, offers, contacts and tax notes):</p>
              <ul className="checks">
                {example.debts.map((d) => <li key={d.id}>{d.name}</li>)}
              </ul>
              {example.entities.length > 0 && (
                <p className="note">
                  Entities removed with them, unless you added a real debt to one: {example.entities.map((e) => e.name).join(", ")}.
                </p>
              )}
              <ActionButton action={clearExampleData} label="Yes, clear the example data" className="btn danger" />
            </div>
          </details>
        </div>
      )}

      <div className="panel">
        <h2>Email reminders</h2>
        {!configured && (
          <div className="msg" style={{ background: "var(--warn-soft)", color: "var(--warn)", marginBottom: 12 }}>
            Email sending is not set up on the server yet, so reminders cannot be sent. The site owner needs to add the email key.
          </div>
        )}
        <p>
          Get one email when something time-sensitive needs attention: a silence period ending, a counter-offer about to expire, or a next action coming due. You get at most one email a day, and only when there is something new.
        </p>
        <p className="note">
          Debts that are only late are listed in the email but never trigger one on their own. Emails include debt names, not balances. They are reminders from a record-keeping tool, not advice.
        </p>
        <ActionForm action={saveReminderPrefs} submitLabel="Save">
          <label className="check wide">
            <input type="checkbox" name="emailReminders" defaultChecked={prefs?.emailReminders ?? false} />
            Email me reminders at {user.email}
          </label>
        </ActionForm>
        {prefs?.lastSentOn && <p className="note">Last reminder email: {fmtDate(prefs.lastSentOn)}.</p>}
      </div>

      <div className="panel">
        <h2>Check that it works</h2>
        <p className="note">Sends the current reminders to {user.email} right now, even if reminders are off. If there is nothing to report, you get a short note saying so.</p>
        <ActionButton action={sendTestReminder} label="Send a test email" />
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Advanced</summary>
          <p className="note" style={{ marginTop: 10 }}>
            Each reminder is emailed once per countdown step (14, 7, 3, 1 and 0 days, then once when overdue). Clearing the record lets the next daily check email current items again.
          </p>
          <ActionButton action={resetSentReminders} label="Clear sent-reminder record" className="btn danger small" />
        </details>
      </div>
    </>
  );
}
