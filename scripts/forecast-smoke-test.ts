// A scenario shaped like a real one: back taxes, an auto loan, a business forecast, cash on hand, and a property sale in
// six months that pays off the taxes and the loan. Uses a throwaway user that is deleted at the end.
// Run: npx tsx scripts/forecast-smoke-test.ts
export {}; // makes this file its own module
process.loadEnvFile(".env.local");

const U = "99999999-9999-9999-9999-999999999999";
const TODAY = "2026-10-26";
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) failed++;
};

(async () => {
  const { pool, runAsUser } = await import("../lib/db");
  const { debts, entities, income, plannedEventDebts, plannedEvents, planSettings } = await import("../lib/db/schema");
  const { parseIncome } = await import("../lib/income");
  const { parseEvent } = await import("../lib/plan/events");
  const { buildPlan } = await import("../lib/plan/build");
  const { monthEvents } = await import("../lib/calendar");
  const { loadPlanData } = await import("../lib/queries");
  const { usdWhole } = await import("../lib/money");

  const cleanup = () => pool.query("delete from auth.users where id = $1", [U]);
  await cleanup();
  try {
    await pool.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','forecast-test@test.invalid')", [U]);
    const c = (d: number) => Math.round(d * 100);

    await runAsUser(U, async (db) => {
      const [me, biz] = await db.insert(entities).values([{ name: "Me", kind: "person" }, { name: "My business", kind: "business" }]).returning({ id: entities.id });
      const ds = await db.insert(debts).values([
        { entityId: me.id, name: "Federal back taxes", type: "federal_tax", originalCents: c(95_000), government: true },
        { entityId: me.id, name: "State back taxes", type: "state_tax", originalCents: c(20_000), government: true },
        { entityId: me.id, name: "Auto loan", type: "auto_loan", originalCents: c(18_000), rateBps: 700, monthlyPaymentCents: c(450), paymentDay: 12 },
        { entityId: me.id, name: "Credit cards", type: "credit_card", originalCents: c(30_000), rateBps: 2400, monthlyPaymentCents: c(900), paymentDay: 5 },
      ]).returning({ id: debts.id, name: debts.name });
      await db.insert(planSettings).values({ livingCostsCents: c(6_000), cashOnHandCents: c(8_000) });

      const pay = parseIncome({ name: "Paycheck", amount: "2100", schedule: "twice", day: "15", day2: "31" });
      const fc = parseIncome({ name: "Side business", amount: "10,000", schedule: "", day: "", day2: "", kind: "variable", confidence: "60", start: "2026-10", duration: "12", entityId: biz.id });
      check("paychecks and a business forecast parse", "rows" in pay && "rows" in fc);
      await db.insert(income).values([...("rows" in pay ? pay.rows : []), ...("rows" in fc ? fc.rows : [])]);

      const ev = parseEvent({ name: "Sale of the property", direction: "in", amount: "150,000", month: "2027-04", confidence: "60", note: "Net of costs", debtIds: ds.filter((d) => d.name !== "Credit cards").map((d) => d.id) });
      check("the sale parses with three debts to pay off", "row" in ev && ev.row.payoffDebtIds.length === 3);
      if ("row" in ev) {
        const { payoffDebtIds, ...row } = ev.row;
        const [created] = await db.insert(plannedEvents).values(row).returning({ id: plannedEvents.id });
        await db.insert(plannedEventDebts).values(payoffDebtIds.map((debtId) => ({ eventId: created.id, debtId })));
      }
    });

    const data = await runAsUser(U, (db) => loadPlanData(db));
    check("the event comes back with the debts it pays off", data.events.length === 1 && data.events[0].payoffDebtIds.length === 3);

    const run = (view?: string, months = 12) =>
      buildPlan({ ...data, livingCostsCents: 600_000, cashOnHandCents: data.settings?.cashOnHandCents ?? null, view, months, today: TODAY });
    const p = run();

    console.log("--- story");
    p.story.forEach((s) => console.log("  " + s));
    console.log("--- next steps");
    p.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}`));

    check("defaults to counting the business at your confidence", p.view === "expected");
    check("the business is counted at 60% of $10,000", p.scenarios.expectedCents === 600_000 && p.scenarios.fullCents === 1_000_000);
    check("the forecast shows the business it comes from", p.forecasts[0]?.entityName === "My business");
    check("the outlook covers 12 months", p.outlook.length === 12 && p.outlook[0].month === "2026-10");

    const steady = run("steady");
    check("with paychecks only, cash runs out", steady.runsOutMonth === "2026-12", steady.runsOutMonth ?? "never");
    check("at your confidence, cash does not run out", p.runsOutMonth === null);
    check("the story says when cash runs out with paychecks only", /cash runs out in December 2026/.test(steady.story.join(" ")));

    const sale = p.eventPlans[0];
    check("the sale would pay off the taxes and the auto loan", sale.payoffs.length === 3 && sale.payoffs.map((x) => x.name).sort().join("|") === "Auto loan|Federal back taxes|State back taxes");
    check("payoffs total about $133,000 and about $17,000 is left", sale.payoffTotalCents > 13_000_000 - 100_000 && sale.proceedsAfterCents > 1_000_000, `${usdWhole(sale.payoffTotalCents)} / ${usdWhole(sale.proceedsAfterCents)}`);
    check("the auto payment is among the payments that stop", sale.monthlyFreedCents === 45_000);
    check("the monthly picture improves the month after", (sale.monthlyLeftAfter ?? 0) - (sale.monthlyLeftBefore ?? 0) === 45_000);
    check("the sale is described in the story", /If Sale of the property comes through in April 2027/.test(p.story.join(" ")));

    const full = run("full");
    const apr = full.outlook.find((m) => m.month === "2027-04")!;
    const may = full.outlook.find((m) => m.month === "2027-05")!;
    check("in the full view the debts are paid off in April", apr.paidOffFull.length === 3);
    check("their payment stops in May", may.obligations.full === may.obligations.expected - 45_000);
    check("the expected view counts only the cash, not the payoffs", p.outlook.find((m) => m.month === "2027-04")!.events.expected === 9_000_000);
    check("asks for exact payoff amounts in writing", p.steps.some((s) => s.id.startsWith("payoff-")));
    check("explains liens when back taxes are paid at closing", p.facts.some((f) => f.id === "lien"));
    const cal = monthEvents(data.debts.map((d) => ({ ...d, id: d.debt.id, name: d.debt.name })), data.income, "2026-11", TODAY);
    check("the business income is not placed on the calendar days, only the two paychecks", cal.filter((e) => e.kind === "income").length === 2);
  } finally {
    await cleanup();
    const left = await pool.query("select (select count(*) from auth.users where id=$1) as u, (select count(*) from public.planned_events where owner_id=$1) as e", [U]);
    console.log(`cleanup: users left=${left.rows[0].u}, events left=${left.rows[0].e}`);
    await pool.end();
  }
  console.log(failed ? `${failed} CHECK(S) FAILED` : "All forecast checks passed. Test user removed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
