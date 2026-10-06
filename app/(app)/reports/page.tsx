import Link from "next/link";
import { Empty, Kpi, PageHead } from "@/components/Bits";
import { withUser } from "@/lib/db";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
import { pct, usdWhole } from "@/lib/money";
import { listDebts } from "@/lib/queries";
import { groupTotals, totals, type Totals } from "@/lib/reports";
import type { DebtStatus, DebtType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function Table({ title, rows }: { title: string; rows: { key: string; totals: Totals }[] }) {
  return (
    <div className="panel tablewrap">
      <h2>{title}</h2>
      <table style={{ minWidth: 620 }}>
        <thead>
          <tr><th /><th className="r">Debts</th><th className="r">Original</th><th className="r">Owed now</th><th className="r">Eliminated</th><th className="r">Paid</th><th className="r">Monthly</th></tr>
        </thead>
        <tbody>
          {rows.map(({ key, totals: t }) => (
            <tr key={key}>
              <td><b>{key}</b></td>
              <td className="r num">{t.count}</td>
              <td className="r num">{usdWhole(t.originalCents)}</td>
              <td className="r num"><b>{usdWhole(t.owedCents)}</b></td>
              <td className="r num" style={{ color: "var(--good)" }}>{usdWhole(t.eliminatedCents)}</td>
              <td className="r num">{usdWhole(t.paidCents)}</td>
              <td className="r num">{usdWhole(t.monthlyCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage() {
  const debts = await withUser((db) => listDebts(db));
  if (debts.length === 0) {
    return (
      <>
        <PageHead title="Reports" />
        <Empty title="No debts yet" text="Reports appear once you add debts." href="/debts/new" cta="Add a debt" />
      </>
    );
  }
  const all = totals(debts);
  const byEntity = groupTotals(debts, (d) => d.entity.name);
  const byType = groupTotals(debts, (d) => TYPE_LABEL[d.debt.type as DebtType]);
  const byStatus = groupTotals(debts, (d) => STATUS_LABEL[d.debt.status as DebtStatus]);
  const guaranteed = debts.filter((d) => d.debt.personalGuarantee && d.owed > 0).sort((a, b) => b.owed - a.owed);
  const settled = debts.filter((d) => d.settlement).sort((a, b) => b.eliminated - a.eliminated);

  return (
    <>
      <PageHead title="Reports" sub="Combined and per-entity totals across everything you track.">
        <div className="actions">
          <a className="btn ghost small" href="/reports/export?kind=debts">Export debts</a>
          <a className="btn ghost small" href="/reports/export?kind=payments">Export payments</a>
          <a className="btn ghost small" href="/reports/export?kind=settlements">Export settlements</a>
        </div>
      </PageHead>
      <div className="grid g4">
        <Kpi label="Owed now" value={usdWhole(all.owedCents)} sub={`of ${usdWhole(all.originalCents)} originally`} />
        <Kpi label="Eliminated" value={usdWhole(all.eliminatedCents)} sub={`${pct(all.eliminatedCents, all.originalCents)}% of the original total`} hero />
        <Kpi label="Paid" value={usdWhole(all.paidCents)} sub="all payments logged" />
        <Kpi label="Personally guaranteed" value={usdWhole(all.guaranteedOwedCents)} sub="still owed on debts with a guarantee" />
      </div>

      <Table title="By entity" rows={byEntity} />
      <Table title="By type" rows={byType} />
      <Table title="By status" rows={byStatus} />

      <div className="grid g2e">
        <div className="panel">
          <h2>Personal guarantees still owed</h2>
          <div className="list">
            {guaranteed.length === 0 && <p className="note">No open debts with a personal guarantee.</p>}
            {guaranteed.map((d) => (
              <div className="item" key={d.debt.id}>
                <div><Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link><span className="sub2">{d.entity.name}</span></div>
                <span className="num">{usdWhole(d.owed)}</span>
              </div>
            ))}
          </div>
          <p className="note">These are debts of one entity that can reach you personally.</p>
        </div>
        <div className="panel">
          <h2>Settlement results</h2>
          <div className="list">
            {settled.length === 0 && <p className="note">No settlements recorded yet.</p>}
            {settled.map((d) => (
              <div className="item" key={d.debt.id}>
                <div>
                  <Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link>
                  <span className="sub2 num">{usdWhole(d.debt.originalCents)} to {usdWhole(d.settlement!.agreedCents)}</span>
                </div>
                <span className="num" style={{ color: "var(--good)" }}>{pct(d.eliminated, d.debt.originalCents)}% less</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="note">Exports open in Excel or Google Sheets. The debts and payments files use the same columns as the Import page.</p>
    </>
  );
}
