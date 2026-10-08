// Builds the Plan for the example data (as a throwaway user, rolled back) and prints what it says.
// Run: npx tsx scripts/plan-smoke-test.ts
export {}; // makes this file its own module
process.loadEnvFile(".env.local");

const U = "66666666-6666-6666-6666-666666666666";
const TODAY = "2026-10-26";

(async () => {
  const { pool, runAsUser } = await import("../lib/db");
  const { planSettings } = await import("../lib/db/schema");
  const { seedExample } = await import("../lib/seed");
  const { buildPlan } = await import("../lib/plan/build");
  const { listDebts, listIncome, listNegotiations, listOffers, listTaxItems } = await import("../lib/queries");
  const { compareExtra } = await import("../lib/plan/simulate");
  const { usdWhole } = await import("../lib/money");

  const cleanup = () => pool.query("delete from auth.users where id = $1", [U]);
  await cleanup();
  try {
    await pool.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','plan-test@test.invalid')", [U]);
    const data = await runAsUser(U, async (db) => {
      await seedExample(db);
      await db.insert(planSettings).values({ livingCostsCents: 200_000 });
      return {
        debts: await listDebts(db), negs: await listNegotiations(db), offers: await listOffers(db), income: await listIncome(db), taxRows: await listTaxItems(db),
        living: (await db.select().from(planSettings))[0].livingCostsCents,
      };
    });
    const plan = buildPlan({ ...data, livingCostsCents: data.living, today: TODAY, events: [], entities: [], cashOnHandCents: null });

    console.log("== STORY");
    plan.story.forEach((p) => console.log("  " + p));
    console.log("== NEXT STEPS");
    plan.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}\n     ${s.why}`));
    console.log("== ORDER");
    plan.order.forEach((p, i) => console.log(`  ${i + 1}. [tier ${p.tier}] ${p.name}: ${p.facts.join(" ")}`));
    console.log("== DID YOU KNOW:", plan.facts.map((f) => f.id).join(", "));
    console.log("== SIMULATOR INPUT:", plan.simDebts.map((d) => `${d.name}${d.fixed ? " (settled)" : ""}`).join(" | "));
    console.log("   not included:", plan.excluded.map((e) => `${e.name} (${e.reason})`).join(" | ") || "none");
    const c = compareExtra(plan.simDebts, plan.defaultExtraCents, "avalanche");
    console.log(`   with ${usdWhole(plan.defaultExtraCents)} extra: ${c.monthsSaved} months sooner, ${usdWhole(c.interestSavedCents)} interest saved`);
  } finally {
    await cleanup();
    const left = await pool.query("select count(*) n from auth.users where id=$1", [U]);
    console.log(`cleanup: test users left=${left.rows[0].n}`);
    await pool.end();
  }
})().catch((e) => { console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
