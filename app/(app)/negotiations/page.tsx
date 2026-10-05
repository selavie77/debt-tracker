import Link from "next/link";
import { loadNegotiationExamples } from "@/app/actions";
import { advanceStage, startNegotiation } from "@/app/negotiation-actions";
import { Empty, PageHead } from "@/components/Bits";
import { withUser } from "@/lib/db";
import { STAGES } from "@/lib/db/schema";
import { daysBetween, fmtDate, todayISO } from "@/lib/dates";
import { usdWhole } from "@/lib/money";
import { STAGE_LABEL, nextStage, silenceProgress } from "@/lib/negotiation";
import { listDebts, listNegotiations, listOffers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NegotiationsPage() {
  const [debts, negs, offers] = await withUser((db) => Promise.all([listDebts(db), listNegotiations(db), listOffers(db)]));
  const today = todayISO();
  const byDebt = new Map(negs.map((n) => [n.debtId, n]));
  const idle = debts.filter((d) => !byDebt.has(d.debt.id) && (d.debt.status === "active" || d.debt.status === "negotiating") && d.owed > 0);

  return (
    <>
      <PageHead title="Negotiations" sub="Where each debt stands. Move a card when the stage changes. Open a debt to log offers and contacts." />
      {debts.length === 0 ? (
        <Empty title="No debts yet" text="Add a debt, then start tracking its negotiation here." href="/debts/new" cta="Add a debt" />
      ) : (
        <>
          <div className="kanban">
            {STAGES.map((stage) => {
              const cards = negs.filter((n) => n.stage === stage);
              const next = nextStage(stage);
              return (
                <div className="col" key={stage}>
                  <h3><span>{STAGE_LABEL[stage]}</span><span className="num">{cards.length}</span></h3>
                  {cards.map((n) => {
                    const d = debts.find((x) => x.debt.id === n.debtId);
                    if (!d) return null;
                    const sp = stage === "silence" ? silenceProgress(n, today) : null;
                    const last = offers.filter((o) => o.debtId === n.debtId).at(-1);
                    const daysIn = daysBetween(n.stageChangedOn, today);
                    return (
                      <div className="card" key={n.id}>
                        <Link href={`/debts/${d.debt.id}`} className="t">{d.debt.name}</Link>
                        <span className="num note">{usdWhole(d.owed)} owed &middot; {daysIn}d in stage</span>
                        {sp && (
                          <>
                            <div className="bar"><i style={{ width: `${Math.min(100, (sp.elapsed / sp.total) * 100)}%`, background: sp.left < 0 ? "var(--warn)" : "var(--accent)" }} /></div>
                            <span className="note">{sp.left >= 0 ? `Silence ends ${fmtDate(sp.endsOn)} (${sp.left}d left)` : `Silence ended ${fmtDate(sp.endsOn)}`}</span>
                          </>
                        )}
                        {last && (
                          <span className="note">
                            Last offer: {last.party === "us" ? "ours" : "theirs"} {usdWhole(last.amountCents)}
                            {last.expiresOn && last.party === "creditor" ? `, expires ${fmtDate(last.expiresOn)}` : ""}
                          </span>
                        )}
                        {n.nextActionOn && (
                          <span className={`chip ${n.nextActionOn < today ? "c-crit" : "c-neg"}`} style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
                            {n.nextActionNote || "Next action"}: {fmtDate(n.nextActionOn)}
                          </span>
                        )}
                        {next && (
                          <form action={advanceStage.bind(null, d.debt.id)}>
                            <button className="btn small" type="submit">Move to {STAGE_LABEL[next]}</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && <div className="empty">Nothing at this stage</div>}
                </div>
              );
            })}
          </div>
          {negs.length === 0 && debts.some((d) => d.debt.name === "American Express business card") && (
            <form action={loadNegotiationExamples} className="panel">
              <h2>Just looking around?</h2>
              <p className="note">Add example negotiations, offers, contacts and monthly income to the example debts.</p>
              <button className="btn ghost" type="submit">Load example negotiations</button>
            </form>
          )}
          {idle.length > 0 && (
            <div className="panel">
              <h2>Debts not in a negotiation</h2>
              <div className="list">
                {idle.map((d) => (
                  <div className="item" key={d.debt.id}>
                    <div><Link href={`/debts/${d.debt.id}`}>{d.debt.name}</Link><span className="sub2">{usdWhole(d.owed)} owed</span></div>
                    <form action={startNegotiation.bind(null, d.debt.id)}>
                      <button className="btn ghost small" type="submit">Start tracking</button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
