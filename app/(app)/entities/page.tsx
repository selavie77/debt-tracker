import Link from "next/link";
import { addEntity } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Kpi, PageHead } from "@/components/Bits";
import { withUser } from "@/lib/db";
import { usdWhole } from "@/lib/money";
import { listDebts, listEntities } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  const [entities, debts] = await withUser((db) => Promise.all([listEntities(db), listDebts(db)]));
  const total = (f: (d: (typeof debts)[number]) => number, list = debts) => list.reduce((s, d) => s + f(d), 0);
  return (
    <>
      <PageHead title="Entities" sub="Each person or company keeps its own debts. Personal guarantees link them." />
      {debts.length > 0 && (
        <div className="grid g4">
          <Kpi label="Owed, all entities" value={usdWhole(total((d) => d.owed))} sub="combined" />
          <Kpi label="Original total" value={usdWhole(total((d) => d.debt.originalCents))} sub="combined" />
          <Kpi label="Eliminated" value={usdWhole(total((d) => d.eliminated))} sub="combined" hero />
          <Kpi label="Paid so far" value={usdWhole(total((d) => d.paid))} sub="combined" />
        </div>
      )}
      <div className="grid g2e">
        {entities.map((e) => {
          const ds = debts.filter((d) => d.debt.entityId === e.id);
          const guar = ds.filter((d) => d.debt.personalGuarantee);
          return (
            <div className="panel" key={e.id}>
              <h2>{e.kind === "person" ? "Person" : "Business"}</h2>
              <div style={{ font: "700 19px var(--f-display), system-ui", marginBottom: 10 }}>{e.name}</div>
              <div className="list">
                <div className="item"><span className="note">Debts</span><span className="num">{ds.length}</span></div>
                <div className="item"><span className="note">Original</span><span className="num">{usdWhole(total((d) => d.debt.originalCents, ds))}</span></div>
                <div className="item"><span className="note">Owed now</span><span className="num"><b>{usdWhole(total((d) => d.owed, ds))}</b></span></div>
                <div className="item"><span className="note">Eliminated</span><span className="num" style={{ color: "var(--good)" }}>{usdWhole(total((d) => d.eliminated, ds))}</span></div>
              </div>
              {guar.length > 0 && (
                <>
                  <h2 style={{ marginTop: 14 }}>Personal guarantees ({guar.length})</h2>
                  <div className="list">
                    {guar.map((d) => (
                      <div className="item" key={d.debt.id}><Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link><span className="num">{usdWhole(d.owed)}</span></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="panel">
        <h2>Add an entity</h2>
        <ActionForm action={addEntity} submitLabel="Add entity" resetOnSuccess>
          <label>Name<input type="text" name="name" placeholder="Operating Co. LLC" required /></label>
          <label>Kind
            <select name="kind" defaultValue="business">
              <option value="person">Person</option>
              <option value="business">Business</option>
            </select>
          </label>
        </ActionForm>
      </div>
    </>
  );
}
