import Link from "next/link";
import { loadExampleData } from "@/app/actions";
import { withUser } from "@/lib/db";
import { Chart } from "@/components/Chart";
import { Empty, Kpi, PageHead } from "@/components/Bits";
import { fmtDate, todayISO } from "@/lib/dates";
import { monthlyObligation, monthlyTotals, nextDue } from "@/lib/finance";
import { pct, usdWhole } from "@/lib/money";
import { buildReminders } from "@/lib/negotiation";
import { listDebts, listEntities, listNegotiations, listOffers, listTaxItems } from "@/lib/queries";
import { pendingTaxCount, taxFlags } from "@/lib/tax";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [debts, entities, negs, offers, taxRows] = await withUser((db) =>
    Promise.all([listDebts(db), listEntities(db), listNegotiations(db), listOffers(db), listTaxItems(db)]),
  );
  if (debts.length === 0) {
    return (
      <>
        <PageHead title="Dashboard" />
        <Empty
          title={entities.length === 0 ? "Start by adding who owes the debts" : "No debts yet"}
          text={entities.length === 0 ? "Add yourself and each company as an entity, then add their debts." : "Add your first debt, or import several at once from a spreadsheet."}
          href={entities.length === 0 ? "/entities" : "/debts/new"}
          cta={entities.length === 0 ? "Add an entity" : "Add a debt"}
        />
        {entities.length === 0 && (
          <form action={loadExampleData} className="panel">
            <h2>Just looking around?</h2>
            <p className="note">Load example debts modeled on the book. They are saved to your account and you can delete them later.</p>
            <button className="btn ghost" type="submit">Load example data</button>
          </form>
        )}
      </>
    );
  }
  const today = todayISO();
  const original = debts.reduce((s, d) => s + d.debt.originalCents, 0);
  const owed = debts.reduce((s, d) => s + d.owed, 0);
  const gone = debts.reduce((s, d) => s + d.eliminated, 0);
  const paid = debts.reduce((s, d) => s + d.paid, 0);
  const monthly = debts.reduce((s, d) => s + monthlyObligation(d, today), 0);
  const upcoming = debts
    .map((d) => ({ d, due: nextDue(d, today) }))
    .filter((x): x is { d: (typeof debts)[number]; due: { date: string; amountCents: number } } => x.due !== null)
    .sort((a, b) => (a.due.date < b.due.date ? -1 : 1))
    .slice(0, 5);

  const dates = debts.flatMap((d) => [d.debt.createdAt.slice(0, 10), d.settlement?.agreedOn ?? "9999", ...d.payments.map((p) => p.paidOn)]).filter((x) => x !== "9999").sort();
  const from = (dates[0] ?? today).slice(0, 7) + "-01";
  const series = monthlyTotals(debts, from, today);
  const points = series.length > 1 ? series.map((m) => ({ label: m.month, value: m.owedCents })) : [];

  const taxPending = pendingTaxCount(taxFlags(debts), new Set(taxRows.filter((t) => t.reviewedWithPro).map((t) => t.debtId)));
  const reminders = buildReminders(
    debts.map((d) => ({ id: d.debt.id, name: d.debt.name, status: d.debt.status, owedCents: d.owed, delinquentSince: d.debt.delinquentSince })),
    negs,
    offers,
    today,
  );
  const byStatus = debts.reduce<Record<string, number>>((acc, d) => ((acc[d.debt.status] = (acc[d.debt.status] ?? 0) + 1), acc), {});

  return (
    <>
      <PageHead title="Dashboard" sub={`${debts.length} debts across ${entities.length} ${entities.length === 1 ? "entity" : "entities"}.`}>
        <Link className="btn" href="/debts/new">Add debt</Link>
      </PageHead>
      <div className="grid g4">
        <Kpi label="Owed today" value={usdWhole(owed)} sub={`of ${usdWhole(original)} originally`} />
        <Kpi label="Eliminated" value={usdWhole(gone)} sub={`${pct(gone, original)}% of the original total`} hero />
        <Kpi label="Paid so far" value={usdWhole(paid)} sub="all payments logged" />
        <Kpi label="Monthly payments" value={usdWhole(monthly)} sub="scheduled across debts" />
      </div>
      <div className="panel">
        <h2>Where the original {usdWhole(original)} went</h2>
        <div className="bar" role="img" aria-label="Eliminated, paid and still owed">
          <i style={{ width: `${(gone / original) * 100}%`, background: "var(--good)" }} />
          <i style={{ width: `${(Math.min(paid, original) / original) * 100}%`, background: "var(--accent)" }} />
          <i style={{ width: `${(owed / original) * 100}%`, background: "var(--line)" }} />
        </div>
        <div className="legend">
          <span><b style={{ background: "var(--good)" }} />Eliminated {usdWhole(gone)}</span>
          <span><b style={{ background: "var(--accent)" }} />Paid {usdWhole(paid)}</span>
          <span><b style={{ background: "var(--line)" }} />Still owed {usdWhole(owed)}</span>
        </div>
      </div>
      <div className="grid g2">
        <div className="panel">
          <h2>Total owed over time</h2>
          {points.length ? <Chart points={points} aria="Total owed at the end of each month" /> : <p className="note">The chart appears once there is more than one month of history.</p>}
        </div>
        <div className="panel">
          <h2>Needs attention</h2>
          {reminders.map((r, i) => (
            <div className={`alert ${r.level === "warn" ? "" : r.level}`} key={i}>
              <span className="dot" />
              <div>
                <Link href={`/debts/${r.debtId}`}>{r.title}</Link>
                <span className="sub2">{r.detail}</span>
              </div>
            </div>
          ))}
          {taxPending > 0 && (
            <div className="alert info">
              <span className="dot" />
              <div>
                <Link href="/tax">{taxPending} settled {taxPending === 1 ? "debt has" : "debts have"} not been reviewed for tax</Link>
                <span className="sub2">Forgiven debt can have tax consequences. Check with a professional.</span>
              </div>
            </div>
          )}
          {reminders.length === 0 && taxPending === 0 && <p className="note">Nothing needs attention. Late debts, silence periods ending, expiring offers and due actions appear here.</p>}
        </div>
      </div>
      <div className="grid g2e">
        <div className="panel">
          <h2>Next payments</h2>
          <div className="list">
            {upcoming.map(({ d, due }) => (
              <div className="item" key={d.debt.id}>
                <div><Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link><span className="sub2">{fmtDate(due.date)}</span></div>
                <span className="num">{usdWhole(due.amountCents)}</span>
              </div>
            ))}
            {upcoming.length === 0 && <p className="note">No scheduled payments. Add a settlement schedule or a regular monthly payment to a debt.</p>}
          </div>
        </div>
        <div className="panel">
          <h2>By status</h2>
          <div className="list">
            {Object.entries(byStatus).map(([s, n]) => (
              <div className="item" key={s}><span style={{ textTransform: "capitalize" }}>{s}</span><span className="num">{n}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
