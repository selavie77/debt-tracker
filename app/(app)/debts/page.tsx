import Link from "next/link";
import { Empty, PageHead, StatusChip } from "@/components/Bits";
import { withUser } from "@/lib/db";
import { DEBT_STATUSES } from "@/lib/db/schema";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
import { pct, usdWhole } from "@/lib/money";
import { listDebts, listEntities } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ entity?: string; status?: string }> }) {
  const { entity = "all", status = "all" } = await searchParams;
  const [all, entities] = await withUser((db) => Promise.all([listDebts(db), listEntities(db)]));
  const rows = all.filter((d) => (entity === "all" || d.debt.entityId === entity) && (status === "all" || d.debt.status === status));
  return (
    <>
      <PageHead title="Debts" sub="Select a debt to see its balance, payments and settlement.">
        <div className="filters">
          <form className="filters" method="get">
            <select name="entity" defaultValue={entity} aria-label="Entity">
              <option value="all">All entities</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select name="status" defaultValue={status} aria-label="Status">
              <option value="all">All statuses</option>
              {DEBT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="btn ghost" type="submit">Filter</button>
          </form>
          <Link className="btn" href="/debts/new">Add debt</Link>
        </div>
      </PageHead>
      {all.length === 0 ? (
        <Empty title="No debts yet" text="Add a debt or import a spreadsheet." href="/debts/new" cta="Add a debt" />
      ) : (
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr><th>Debt</th><th>Status</th><th className="r">Original</th><th className="r">Agreed</th><th className="r">Owed now</th><th>Progress</th><th className="r">Payment</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const p = pct(d.paid, d.target);
                return (
                  <tr key={d.debt.id}>
                    <td><Link href={`/debts/${d.debt.id}`}><b>{d.debt.name}</b></Link><span className="sub2">{TYPE_LABEL[d.debt.type]} &middot; {d.entity.name}</span></td>
                    <td><StatusChip status={d.debt.status} /></td>
                    <td className="r num">{usdWhole(d.debt.originalCents)}</td>
                    <td className="r num">{d.settlement ? usdWhole(d.settlement.agreedCents) : <span className="note">none</span>}</td>
                    <td className="r num"><b>{usdWhole(d.owed)}</b></td>
                    <td style={{ minWidth: 110 }}><div className="bar"><i style={{ width: `${p}%`, background: "var(--accent)" }} /></div><span className="note num">{p}% paid</span></td>
                    <td className="r num">{d.settlement ? (d.settlement.installments === 1 ? "lump sum" : `${usdWhole(d.settlement.installmentCents)}/mo`) : d.debt.monthlyPaymentCents ? `${usdWhole(d.debt.monthlyPaymentCents)}/mo` : "-"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="note">No debts match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
