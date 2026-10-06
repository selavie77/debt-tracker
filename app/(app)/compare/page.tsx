import Link from "next/link";
import { Empty, PageHead } from "@/components/Bits";
import { compareColumn, typeLabel } from "@/lib/compare";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { rateLabel, usdWhole } from "@/lib/money";
import { STAGE_LABEL } from "@/lib/negotiation";
import { listDebts, listNegotiations } from "@/lib/queries";

export const dynamic = "force-dynamic";
const MAX = 4;

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const [debts, negs] = await withUser((db) => Promise.all([listDebts(db), listNegotiations(db)]));
  const open = debts.filter((d) => d.debt.status !== "paid");
  if (debts.length === 0) {
    return (
      <>
        <PageHead title="Compare debts" />
        <Empty title="No debts yet" text="Add at least two debts to compare them side by side." href="/debts/new" cta="Add a debt" />
      </>
    );
  }
  const asked = (Array.isArray(id) ? id : id ? [id] : []).filter((x) => debts.some((d) => d.debt.id === x)).slice(0, MAX);
  const chosen = asked.length ? asked : [...open].sort((a, b) => b.owed - a.owed).slice(0, MAX).map((d) => d.debt.id);
  const picked = chosen.map((cid) => debts.find((d) => d.debt.id === cid)!);
  const stageOf = (debtId: string) => {
    const n = negs.find((x) => x.debtId === debtId);
    return n ? STAGE_LABEL[n.stage] : null;
  };
  const cols = picked.map((d) => ({ d, c: compareColumn(d, stageOf(d.debt.id)) }));

  const rows: [string, (x: (typeof cols)[number]) => React.ReactNode][] = [
    ["Type", ({ d }) => typeLabel(d)],
    ["Owed now", ({ c }) => usdWhole(c.owedCents)],
    ["Interest rate", ({ c }) => rateLabel(c.rateBps)],
    ["Interest per year at this balance", ({ c }) => (c.interestPerYearCents == null ? "none while settled" : usdWhole(c.interestPerYearCents))],
    ["Payoff at current payment", ({ c }) => (c.payoffMonths == null ? "n/a" : `${c.payoffMonths} months, ${usdWhole(c.totalInterestCents ?? 0)} interest`)],
    ["Monthly payment", ({ c }) => (c.monthlyCents ? usdWhole(c.monthlyCents) : "none")],
    ["Settlement", ({ c }) => (c.settlementAgreedCents == null ? "none" : `agreed ${usdWhole(c.settlementAgreedCents)}`)],
    ["Negotiation stage", ({ c }) => c.stage ?? "not tracked"],
    ["Government-backed", ({ c }) => (c.government ? "Yes" : "No")],
    ["Collateral", ({ c }) => c.collateral || "None"],
    ["Personal guarantee", ({ c }) => (c.guarantee ? "Yes" : "No")],
    ["Days late", ({ c }) => (c.daysLate ? `${c.daysLate} days` : "Current")],
    ["Late since", ({ d }) => (d.debt.delinquentSince && d.owed > 0 ? fmtDate(d.debt.delinquentSince) : "-")],
  ];

  return (
    <>
      <PageHead title="Compare debts" sub="Facts about each debt side by side, to help you decide how to handle each one." />
      <div className="msg" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
        This page shows facts and things to check. It does not recommend an action and is not legal, tax or financial advice.
      </div>
      <form className="panel" method="get">
        <h2>Pick up to {MAX} debts</h2>
        <div className="picks">
          {open.map((d) => (
            <label className="pick" key={d.debt.id}>
              <input type="checkbox" name="id" value={d.debt.id} defaultChecked={chosen.includes(d.debt.id)} /> {d.debt.name}
            </label>
          ))}
        </div>
        <p><button className="btn small" type="submit">Compare</button></p>
      </form>
      {cols.length < 2 ? (
        <Empty title="Pick at least two debts" text="Tick two or more debts above, then press Compare." />
      ) : (
        <>
          <div className="panel tablewrap">
            <table style={{ minWidth: 160 + cols.length * 190 }}>
              <thead>
                <tr><th />{cols.map(({ d }) => <th key={d.debt.id}><Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link></th>)}</tr>
              </thead>
              <tbody>
                {rows.map(([label, f]) => (
                  <tr key={label}>
                    <td className="note" style={{ whiteSpace: "nowrap" }}>{label}</td>
                    {cols.map((x) => <td className="num" key={x.d.debt.id}>{f(x)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid g2e">
            {cols.map(({ d, c }) => (
              <div className="panel" key={d.debt.id}>
                <h2>Things to check: {d.debt.name}</h2>
                {c.checks.length === 0 ? <p className="note">Nothing specific flagged.</p> : <ul className="checks">{c.checks.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
