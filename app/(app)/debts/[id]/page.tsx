import Link from "next/link";
import { notFound } from "next/navigation";
import { addPayment, deleteDebt, deletePayment, removeSettlement, saveSettlement, updateDebt } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Kpi, PageHead, StatusChip } from "@/components/Bits";
import { Chart } from "@/components/Chart";
import { DebtFields } from "@/components/DebtFields";
import { withUser } from "@/lib/db";
import { daysBetween, fmtDate, todayISO } from "@/lib/dates";
import { amortize, balanceSteps, nextDue, settlementSchedule } from "@/lib/finance";
import { TYPE_LABEL } from "@/lib/labels";
import { pct, rateLabel, usd, usdWhole } from "@/lib/money";
import { getDebt, getNegotiationBundle, listEntities } from "@/lib/queries";
import { NegotiationPanel } from "@/components/NegotiationPanel";

export const dynamic = "force-dynamic";

export default async function DebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, entities, neg] = await withUser((db) => Promise.all([getDebt(db, id), listEntities(db), getNegotiationBundle(db, id)]));
  if (!d) notFound();
  const today = todayISO();
  const { debt, settlement: s } = d;
  const steps = balanceSteps(d);
  const points = steps.map((st, i) => ({ label: st.date ? st.date.slice(2, 7) : "Start", value: st.balanceCents, key: i }));
  const due = nextDue(d, today);
  const sched = s ? settlementSchedule(s) : [];
  const projection =
    !s && debt.rateBps != null && debt.monthlyPaymentCents && d.owed > 0
      ? amortize({ balanceCents: d.owed, aprBps: debt.rateBps, paymentCents: debt.monthlyPaymentCents, startDate: today })
      : null;
  const late = debt.delinquentSince && d.owed > 0 ? daysBetween(debt.delinquentSince, today) : 0;
  const terms: [string, string][] = [
    ["Creditor", debt.creditor || "-"],
    ["Entity", d.entity.name],
    ["Type", TYPE_LABEL[debt.type]],
    ["Interest rate", rateLabel(debt.rateBps)],
    ["Collateral", debt.collateral || "None"],
    ["Personal guarantee", debt.personalGuarantee ? "Yes" : "No"],
    ["Government-backed", debt.government ? "Yes" : "No"],
  ];
  const today1 = today;

  return (
    <>
      <Link className="back" href="/debts">&larr; All debts</Link>
      <PageHead title={debt.name} sub={`${debt.creditor || TYPE_LABEL[debt.type]} · ${d.entity.name}`}>
        <StatusChip status={debt.status} />
      </PageHead>
      {late > 0 && <div className="msg err">Delinquent since {fmtDate(debt.delinquentSince!)} ({late} days).</div>}

      <div className="grid g4">
        <Kpi label="Owed now" value={usdWhole(d.owed)} sub={s ? `of ${usdWhole(s.agreedCents)} agreed` : `of ${usdWhole(debt.originalCents)} original`} />
        <Kpi label="Original" value={usdWhole(debt.originalCents)} sub={`${rateLabel(debt.rateBps)} rate`} />
        <Kpi label="Eliminated" value={usdWhole(d.eliminated)} sub={s ? `${pct(d.eliminated, debt.originalCents)}% below original` : "no settlement yet"} hero={d.eliminated > 0} />
        <Kpi label="Paid" value={usdWhole(d.paid)} sub={due ? `next ${usdWhole(due.amountCents)} on ${fmtDate(due.date)}` : "no payment scheduled"} />
      </div>

      <div className="grid g2">
        <div className="panel">
          <h2>Balance after each payment</h2>
          {points.length > 1 ? <Chart points={points} step aria="Balance after each payment" /> : <p className="note">Log a payment to see the balance step down.</p>}
        </div>
        <div className="panel">
          <h2>Terms</h2>
          <div className="list">
            {terms.map(([k, v]) => <div className="item" key={k}><span className="note">{k}</span><span style={{ textAlign: "right" }}>{v}</span></div>)}
          </div>
        </div>
      </div>

      <NegotiationPanel d={d} negotiation={neg.negotiation} offers={neg.offers} contacts={neg.contacts} />

      <div className="panel">
        <h2>Log a payment</h2>
        <ActionForm action={addPayment.bind(null, id)} submitLabel="Add payment" resetOnSuccess>
          <label>Amount ($)<input type="text" inputMode="decimal" name="amount" defaultValue={s ? String(s.installmentCents / 100) : debt.monthlyPaymentCents ? String(debt.monthlyPaymentCents / 100) : ""} required /></label>
          <label>Date<input type="date" name="paidOn" defaultValue={today1} required /></label>
          <label>Interest part ($, optional)<input type="text" inputMode="decimal" name="interest" placeholder="0" /></label>
          <label>Note<input type="text" name="note" placeholder="Confirmation number" /></label>
        </ActionForm>
      </div>

      <div className="grid g2e">
        <div className="panel">
          <h2>Settlement</h2>
          {s && (
            <p className="note">
              {usd(s.agreedCents)} agreed on {fmtDate(s.agreedOn)}, paid as {s.installments} payments of about {usd(s.installmentCents)}. Last payment {fmtDate(sched[sched.length - 1].date)}.
            </p>
          )}
          <ActionForm action={saveSettlement.bind(null, id)} submitLabel={s ? "Update settlement" : "Save settlement"}>
            <label>Agreed amount to pay ($)<input type="text" inputMode="decimal" name="agreed" defaultValue={s ? String(s.agreedCents / 100) : ""} placeholder="50,000" required /></label>
            <label>Number of payments<input type="number" name="installments" min={1} max={600} defaultValue={s?.installments ?? 1} required /></label>
            <label>Agreed on<input type="date" name="agreedOn" defaultValue={s?.agreedOn ?? today1} required /></label>
            <label>First payment<input type="date" name="firstPaymentOn" defaultValue={s?.firstPaymentOn ?? today1} required /></label>
            <label className="wide">Notes<textarea name="notes" defaultValue={s?.notes} placeholder="Discharge terms, how it will be reported" /></label>
          </ActionForm>
          {s && (
            <form action={removeSettlement.bind(null, id)} style={{ marginTop: 10 }}>
              <button className="btn danger small" type="submit">Remove settlement</button>
            </form>
          )}
        </div>
        <div className="panel tablewrap">
          <h2>{s ? "Payment schedule" : projection ? "Payoff projection" : "Schedule"}</h2>
          {s ? (
            <table style={{ minWidth: 260 }}>
              <thead><tr><th>Due</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {sched.slice(0, 12).map((r) => <tr key={r.date}><td>{fmtDate(r.date)}</td><td className="r num">{usd(r.amountCents)}</td></tr>)}
                {sched.length > 12 && <tr><td colSpan={2} className="note">and {sched.length - 12} more</td></tr>}
              </tbody>
            </table>
          ) : projection ? (
            projection.payoffNever ? (
              <p className="msg err">At {usd(debt.monthlyPaymentCents!)} a month, the payment does not cover the interest, so the balance never goes down.</p>
            ) : (
              <p>
                Paying {usd(debt.monthlyPaymentCents!)} a month at {rateLabel(debt.rateBps)} clears the balance in <b>{projection.rows.length} months</b> (by {fmtDate(projection.rows[projection.rows.length - 1].date)}), with <b>{usd(projection.totalInterestCents)}</b> in interest.
              </p>
            )
          ) : (
            <p className="note">Add a settlement, or set an interest rate and a regular monthly payment to see a projection.</p>
          )}
        </div>
      </div>

      <div className="panel tablewrap">
        <h2>Payments</h2>
        {d.payments.length === 0 ? (
          <p className="note">No payments yet.</p>
        ) : (
          <table style={{ minWidth: 420 }}>
            <thead><tr><th>Date</th><th className="r">Amount</th><th className="r">Interest</th><th>Note</th><th /></tr></thead>
            <tbody>
              {[...d.payments].reverse().map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidOn)}</td>
                  <td className="r num">{usd(p.amountCents)}</td>
                  <td className="r num">{p.interestCents ? usd(p.interestCents) : "-"}</td>
                  <td className="note">{p.note}</td>
                  <td className="r"><form action={deletePayment.bind(null, id, p.id)}><button className="btn danger small" type="submit">Delete</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="panel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Edit debt details</summary>
        <div style={{ marginTop: 14 }}>
          <ActionForm action={updateDebt.bind(null, id)} submitLabel="Save changes">
            <DebtFields entities={entities} debt={debt} />
          </ActionForm>
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", color: "var(--crit)" }}>Delete this debt</summary>
            <form action={deleteDebt.bind(null, id)} style={{ marginTop: 8 }}>
              <p className="note">This permanently removes the debt, its settlement and all {d.payments.length} logged payments.</p>
              <button className="btn danger small" type="submit">Yes, delete permanently</button>
            </form>
          </details>
        </div>
      </details>
    </>
  );
}
