// Proves "Clear example data" removes only example rows and never real data.
// Uses a throwaway user that is deleted at the end (cascades to everything it created).
// Run: npx tsx scripts/example-data-test.ts
export {}; // makes this file its own module
process.loadEnvFile(".env.local");

const TEST_USER = "55555555-5555-5555-5555-555555555555";
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) failed++;
};

(async () => {
  const { pool, runAsUser } = await import("../lib/db");
  const { debts, entities, income, payments, reminderSent, settlements } = await import("../lib/db/schema");
  const { seedExample } = await import("../lib/seed");
  const { clearExample, exampleSummary, markEntityReal } = await import("../lib/example-data");
  const { eq } = await import("drizzle-orm");

  const cleanup = () => pool.query("delete from auth.users where id = $1", [TEST_USER]);
  await cleanup();
  try {
    await pool.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','example-test@test.invalid')", [TEST_USER]);

    const ids = await runAsUser(TEST_USER, async (db) => {
      await seedExample(db);
      const s = await exampleSummary(db);
      // A real debt under an example entity (what happens when you add your own debt to "Operating Co. LLC").
      const biz = s.entities.find((e) => e.name === "Operating Co. LLC")!;
      await markEntityReal(db, biz.id);
      const [realUnderExample] = await db.insert(debts).values({ entityId: biz.id, name: "My real loan", originalCents: 500_000 }).returning({ id: debts.id });
      await db.insert(payments).values({ debtId: realUnderExample.id, paidOn: "2026-09-01", amountCents: 10_000 });
      // A fully real entity with a real debt and income.
      const [realEntity] = await db.insert(entities).values({ name: "Real Co", kind: "business" }).returning({ id: entities.id });
      const [realOwn] = await db.insert(debts).values({ entityId: realEntity.id, name: "Real own debt", originalCents: 900_000 }).returning({ id: debts.id });
      await db.insert(income).values({ name: "Real income", amountCents: 300_000, dayOfMonth: 5 });
      // Sent-reminder records for an example debt and for a real debt.
      const exampleDebt = s.debts[0];
      await db.insert(reminderSent).values([
        { key: `${exampleDebt.id}:action:2026-10-16:7`, sentOn: "2026-10-12" },
        { key: `${realOwn.id}:action:2026-10-16:7`, sentOn: "2026-10-12" },
      ]);
      return { realUnderExample: realUnderExample.id, realOwn: realOwn.id, realEntity: realEntity.id, bizEntity: biz.id };
    });

    const before = await runAsUser(TEST_USER, exampleSummary);
    check("summary counts example data", before.debts.length === 8 && before.incomeCount === 2 && before.entities.length === 1, `${before.debts.length} debts, ${before.entities.length} entity, ${before.incomeCount} income`);
    check("entity with a real debt is no longer marked example", !before.entities.some((e) => e.name === "Operating Co. LLC"));

    const removed = await runAsUser(TEST_USER, clearExample);
    check("removed the 8 example debts", removed.debts === 8, JSON.stringify(removed));
    check("removed the 2 example income rows", removed.income === 2);
    check("removed only the example entity with no real debts", removed.entities === 1);

    const after = await runAsUser(TEST_USER, async (db) => ({
      debts: await db.select({ id: debts.id, name: debts.name }).from(debts),
      entities: await db.select({ name: entities.name }).from(entities),
      income: await db.select({ name: income.name }).from(income),
      payments: await db.select({ id: payments.id }).from(payments),
      settlements: await db.select({ id: settlements.id }).from(settlements),
      sent: await db.select({ key: reminderSent.key }).from(reminderSent),
      realDebtStillThere: await db.select().from(debts).where(eq(debts.id, ids.realUnderExample)),
    }));
    check("real debts survive", after.debts.map((d) => d.name).sort().join("|") === "My real loan|Real own debt", after.debts.map((d) => d.name).join("|"));
    check("entities with real debts survive", after.entities.map((e) => e.name).sort().join("|") === "Operating Co. LLC|Real Co");
    check("real income survives, example income gone", after.income.length === 1 && after.income[0].name === "Real income");
    check("real payment survives, example payments and settlements gone", after.payments.length === 1 && after.settlements.length === 0);
    check("sent-reminder record for the example debt is cleaned, the real one stays", after.sent.length === 1 && after.sent[0].key.startsWith(ids.realOwn));
    check("nothing example is left", (await runAsUser(TEST_USER, exampleSummary)).total === 0);

    const again = await runAsUser(TEST_USER, clearExample);
    check("running it again removes nothing", again.debts === 0 && again.entities === 0 && again.income === 0);
  } finally {
    await cleanup();
    const left = await pool.query("select (select count(*) from auth.users where id=$1) as u, (select count(*) from public.debts where owner_id=$1) as d", [TEST_USER]);
    console.log(`cleanup: users left=${left.rows[0].u}, debts left=${left.rows[0].d}`);
    await pool.end();
  }
  console.log(failed ? `${failed} CHECK(S) FAILED` : "All example-data checks passed. Test user removed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
});
