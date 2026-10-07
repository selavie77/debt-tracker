// End-to-end test of the daily reminder job against the real database.
// Creates a throwaway user, runs the job with a FAKE sender (nothing is emailed), then deletes the user,
// which cascades to every row it created. The job is limited to this user, so real accounts are never touched.
// Run: npx tsx scripts/reminders-job-test.ts
export {}; // makes this file its own module
process.loadEnvFile(".env.local");

const TEST_USER = "44444444-4444-4444-4444-444444444444";
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) failed++;
};

(async () => {
  const { pool, runAsUser } = await import("../lib/db");
  const { notificationPrefs, reminderSent } = await import("../lib/db/schema");
  const { seedExample } = await import("../lib/seed");
  const { runReminderJob } = await import("../lib/reminders");

  const cleanup = () => pool.query("delete from auth.users where id = $1", [TEST_USER]);
  await cleanup();
  try {
    await pool.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','reminder-test@test.invalid')", [TEST_USER]);
    await runAsUser(TEST_USER, async (db) => {
      await db.insert(notificationPrefs).values({ emailReminders: true });
      await seedExample(db);
    });

    const sent: { to: string; subject: string; text: string }[] = [];
    const ok = async (m: { to: string; subject: string; html: string; text: string }) => (sent.push(m), { ok: true as const });
    const bad = async () => ({ ok: false as const, error: "simulated failure" });
    const only = [TEST_USER];

    // Quiet day: nothing time-sensitive yet.
    let r = await runReminderJob(ok, "2026-10-05", only);
    check("quiet day: no email", r.emailed === 0 && r.nothingNew === 1, JSON.stringify(r));

    // Oct 26: counter-offer expires in 4 days, silence ends in 11, next action overdue.
    r = await runReminderJob(bad, "2026-10-26", only);
    check("failed send is counted and not recorded", r.failed === 1 && r.emailed === 0, JSON.stringify(r));
    const recorded = await runAsUser(TEST_USER, (db) => db.select().from(reminderSent));
    check("nothing recorded after a failed send", recorded.length === 0);

    r = await runReminderJob(ok, "2026-10-26", only);
    check("retry after failure sends the email", r.emailed === 1 && sent.length === 1, JSON.stringify(r));
    check("email goes to the user's address", sent[0]?.to === "reminder-test@test.invalid");
    check("subject names the count", /items need attention/.test(sent[0]?.subject ?? ""), sent[0]?.subject);
    check("body lists late debts separately", /Also late:/.test(sent[0]?.text ?? ""));
    check("body has no balances", !/\$[\d,]{4,}/.test(sent[0]?.text ?? ""));

    r = await runReminderJob(ok, "2026-10-26", only);
    check("same day: not emailed twice", r.optedIn === 0 && sent.length === 1, JSON.stringify(r));

    r = await runReminderJob(ok, "2026-10-27", only);
    check("next day, new countdown step: emailed", r.emailed === 1 && sent.length === 2, JSON.stringify(r));

    r = await runReminderJob(ok, "2026-10-28", only);
    check("next day, nothing new: quiet", r.emailed === 0 && r.nothingNew === 1 && sent.length === 2, JSON.stringify(r));

    // Opted out means no email, even with new items.
    await runAsUser(TEST_USER, (db) => db.update(notificationPrefs).set({ emailReminders: false }));
    r = await runReminderJob(ok, "2026-11-04", only);
    check("opted out: not considered", r.optedIn === 0 && sent.length === 2, JSON.stringify(r));
  } finally {
    await cleanup();
    const left = await pool.query("select (select count(*) from auth.users where id=$1) as u, (select count(*) from public.debts where owner_id=$1) as d", [TEST_USER]);
    console.log(`cleanup: users left=${left.rows[0].u}, debts left=${left.rows[0].d}`);
    await pool.end();
  }
  console.log(failed ? `${failed} CHECK(S) FAILED` : "All reminder job checks passed. Test user removed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
});
