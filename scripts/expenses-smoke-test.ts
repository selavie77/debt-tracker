// Adds itemized living costs for a throwaway user and checks they flow into the plan. Everything is deleted at the end.
// Run: npx tsx scripts/expenses-smoke-test.ts
export {}; // makes this file its own module
process.loadEnvFile(".env.local");

const U = "77777777-7777-7777-7777-777777777777";
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) failed++;
};

(async () => {
  const { pool, runAsUser } = await import("../lib/db");
  const { expenses, planSettings } = await import("../lib/db/schema");
  const { seedExample } = await import("../lib/seed");
  const { parseExpense, effectiveLivingCosts, byCategory } = await import("../lib/expenses");
  const { buildPlan } = await import("../lib/plan/build");
  const { listDebts, listExpenses, listIncome, listNegotiations, listOffers, listTaxItems } = await import("../lib/queries");

  const cleanup = () => pool.query("delete from auth.users where id = $1", [U]);
  await cleanup();
  try {
    await pool.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','expenses-test@test.invalid')", [U]);
    const load = () =>
      runAsUser(U, async (db) => ({
        debts: await listDebts(db), negs: await listNegotiations(db), offers: await listOffers(db), income: await listIncome(db),
        taxRows: await listTaxItems(db), expenses: await listExpenses(db), single: (await db.select().from(planSettings))[0]?.livingCostsCents ?? null,
      }));

    await runAsUser(U, async (db) => {
      await seedExample(db);
      await db.insert(planSettings).values({ livingCostsCents: 100_000 }); // a single total of $1,000
    });
    let d = await load();
    let living = effectiveLivingCosts(d.expenses, d.single);
    check("with no itemized costs the single total is used", living.source === "single" && living.cents === 100_000);
    const before = buildPlan({ ...d, livingCostsCents: living.cents, today: "2026-10-26", events: [], entities: [], cashOnHandCents: null });

    const rows = [
      { name: "Rent", category: "housing", amount: "1400", frequency: "monthly" },
      { name: "Electricity", category: "utilities", amount: "120", frequency: "monthly" },
      { name: "Cell phone", category: "phone_internet", amount: "85", frequency: "monthly" },
      { name: "Netflix", category: "subscriptions", amount: "15.99", frequency: "monthly" },
      { name: "Gas for the car", category: "transportation", amount: "50", frequency: "weekly" },
    ].map((r) => parseExpense(r));
    check("all five costs parse", rows.every((r) => "row" in r));
    await runAsUser(U, (db) => db.insert(expenses).values(rows.map((r) => ("row" in r ? r.row : null)!).filter(Boolean)));

    d = await load();
    living = effectiveLivingCosts(d.expenses, d.single);
    const expected = 140_000 + 12_000 + 8_500 + 1_599 + 21_667;
    check("itemized costs replace the single total", living.source === "itemized" && living.cents === expected, `$${(living.cents ?? 0) / 100} a month`);
    const cats = byCategory(d.expenses);
    check("biggest category is housing", cats[0].category === "housing");
    const after = buildPlan({ ...d, livingCostsCents: living.cents, today: "2026-10-26", events: [], entities: [], cashOnHandCents: null });
    check("the plan's left-over changes by the difference", (before.surplusCents ?? 0) - (after.surplusCents ?? 0) === expected - 100_000, `${before.surplusCents} -> ${after.surplusCents}`);

    await runAsUser(U, (db) => db.delete(expenses));
    d = await load();
    check("clearing the list goes back to the single total", effectiveLivingCosts(d.expenses, d.single).source === "single");
  } finally {
    await cleanup();
    const left = await pool.query("select (select count(*) from auth.users where id=$1) as u, (select count(*) from public.expenses where owner_id=$1) as e", [U]);
    console.log(`cleanup: users left=${left.rows[0].u}, expenses left=${left.rows[0].e}`);
    await pool.end();
  }
  console.log(failed ? `${failed} CHECK(S) FAILED` : "All living-cost checks passed. Test user removed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
