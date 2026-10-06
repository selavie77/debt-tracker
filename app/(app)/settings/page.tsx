import { resetSentReminders, saveReminderPrefs, sendTestReminder } from "@/app/settings-actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Bits";
import { ActionButton } from "@/components/TestEmailButton";
import { fmtDate } from "@/lib/dates";
import { requireUser, withUser } from "@/lib/db";
import { notificationPrefs } from "@/lib/db/schema";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const prefs = await withUser(async (db) => (await db.select().from(notificationPrefs))[0] ?? null);
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
