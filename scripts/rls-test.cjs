// Proves row-level security isolates users. Runs inside a transaction that is always rolled back,
// so it leaves no data and no fake users behind. Run: node scripts/rls-test.cjs
const fs = require("fs");
const { Client } = require("pg");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
let failed = 0;
const check = (name, ok) => { console.log(ok ? "PASS" : "FAIL", name); if (!ok) failed++; };

(async () => {
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const as = async (uid) => {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);
    await c.query("set local role authenticated");
  };
  try {
    await c.query("begin");
    await c.query("insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated','a@test.invalid'), ($2,'authenticated','authenticated','b@test.invalid')", [A, B]);

    await as(A);
    const e = await c.query("insert into entities (name, kind) values ('A entity','person') returning id, owner_id");
    check("owner_id defaults to the signed-in user", e.rows[0].owner_id === A);
    const d = await c.query("insert into debts (entity_id, name, original_cents) values ($1,'A debt',100000) returning id", [e.rows[0].id]);
    await c.query("insert into payments (debt_id, paid_on, amount_cents) values ($1,'2026-01-01',5000)", [d.rows[0].id]);
    check("user A sees own debt", (await c.query("select 1 from debts")).rowCount === 1);
    await c.query("insert into negotiations (debt_id, stage_changed_on) values ($1,'2026-01-01')", [d.rows[0].id]);
    await c.query("insert into offers (debt_id, made_on, party, amount_cents) values ($1,'2026-01-01','us',5000)", [d.rows[0].id]);
    await c.query("insert into contacts (debt_id, contacted_on, channel, direction, summary) values ($1,'2026-01-01','phone','in','hi')", [d.rows[0].id]);
    await c.query("insert into income (name, amount_cents, day_of_month) values ('Salary',210000,1)");
    await c.query("insert into tax_items (debt_id, note) values ($1,'secret')", [d.rows[0].id]);
    await c.query("insert into notification_prefs (email_reminders) values (true)");
    await c.query("insert into plan_settings (living_costs_cents) values (240000)");
    await c.query("insert into expenses (name, category, amount_cents, frequency) values ('Netflix','subscriptions',1599,'monthly')");
    const ev = await c.query("insert into planned_events (name, direction, amount_cents, expected_month, confidence_percent) values ('Sale','in',15000000,'2027-03-01',60) returning id");
    await c.query("insert into planned_event_debts (event_id, debt_id) values ($1,$2)", [ev.rows[0].id, d.rows[0].id]);
    await c.query("insert into reminder_sent (key, sent_on) values ('x:y:z:7','2026-01-01')");

    await as(B);
    check("user B sees no entities of A", (await c.query("select 1 from entities")).rowCount === 0);
    check("user B sees no debts of A", (await c.query("select 1 from debts")).rowCount === 0);
    check("user B sees no payments of A", (await c.query("select 1 from payments")).rowCount === 0);
    for (const t of ["negotiations", "offers", "contacts", "income", "tax_items", "notification_prefs", "reminder_sent", "plan_settings", "expenses", "planned_events", "planned_event_debts"]) {
      check(`user B sees no ${t} of A`, (await c.query(`select 1 from ${t}`)).rowCount === 0);
      check(`user B cannot delete A's ${t}`, (await c.query(`delete from ${t}`)).rowCount === 0);
    }
    check("user B cannot update A's debt", (await c.query("update debts set name='hacked' where id=$1", [d.rows[0].id])).rowCount === 0);
    check("user B cannot delete A's debt", (await c.query("delete from debts where id=$1", [d.rows[0].id])).rowCount === 0);
    await c.query("savepoint s");
    let blocked = false;
    try { await c.query("insert into entities (owner_id, name, kind) values ($1,'forged','person')", [A]); } catch { blocked = true; }
    await c.query("rollback to savepoint s");
    check("user B cannot insert a row owned by A", blocked);

    await as(A);
    check("user A's debt is unchanged", (await c.query("select name from debts")).rows[0].name === "A debt");

    await c.query("reset role");
    await c.query("set local role anon");
    await c.query("savepoint s2");
    let anonBlocked = false;
    try { anonBlocked = (await c.query("select 1 from debts")).rowCount === 0; } catch { anonBlocked = true; }
    check("signed-out (anon) role sees nothing", anonBlocked);
  } finally {
    await c.query("rollback");
    await c.end();
  }
  console.log(failed ? `${failed} CHECK(S) FAILED` : "All isolation checks passed. Nothing was saved.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("ERROR", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
