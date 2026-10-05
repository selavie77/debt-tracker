// Loads the example data as a throwaway user, runs the real queries and Phase 2 logic, then rolls everything back.
// Run: npx tsx scripts/smoke-test.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { monthEvents, monthTotals } from "../lib/calendar";
import type { Db } from "../lib/db";
import { serialize } from "../lib/db/serial";
import * as schema from "../lib/db/schema";
import { buildReminders } from "../lib/negotiation";
import { listDebts, listIncome, listNegotiations, listOffers } from "../lib/queries";
import { seedExample } from "../lib/seed";

process.loadEnvFile(".env.local");
const U = "33333333-3333-3333-3333-333333333333";
const TODAY = "2026-10-05";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','smoke@test.invalid')", [U]);
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: U, role: "authenticated" }), U]);
    await c.query("set local role authenticated");
    const db = drizzle(serialize(c), { schema }) as unknown as Db;

    await seedExample(db);
    const [debts, negs, offers, income] = await Promise.all([listDebts(db), listNegotiations(db), listOffers(db), listIncome(db)]);
    console.log(`debts=${debts.length} negotiations=${negs.length} offers=${offers.length} income=${income.length}`);

    const reminders = buildReminders(
      debts.map((d) => ({ id: d.debt.id, name: d.debt.name, status: d.debt.status, owedCents: d.owed, delinquentSince: d.debt.delinquentSince })),
      negs, offers, TODAY,
    );
    console.log("reminders:");
    reminders.forEach((r) => console.log(`  [${r.level}] ${r.title} - ${r.detail}`));

    const ev = monthEvents(debts.map((d) => ({ ...d, id: d.debt.id, name: d.debt.name })), income, "2026-10", TODAY);
    console.log("October events:", ev.map((e) => `${e.date.slice(8)} ${e.kind} ${e.label.split(" ")[0]}`).join(" | "));
    console.log("October totals (cents):", JSON.stringify(monthTotals(ev)));
  } finally {
    await c.query("rollback");
    await c.end();
  }
  console.log("Rolled back. Nothing was saved.");
})().catch((e) => { console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
