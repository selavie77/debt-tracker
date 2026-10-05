import { addContact, addOffer, deleteContact, deleteOffer, setStage, startNegotiation, stopNegotiation, updateNegotiation } from "@/app/negotiation-actions";
import { fmtDate, todayISO } from "@/lib/dates";
import { CHANNELS, STAGES, type Contact, type Negotiation, type Offer } from "@/lib/db/schema";
import { usd } from "@/lib/money";
import { STAGE_LABEL, silenceProgress } from "@/lib/negotiation";
import { TEMPLATES } from "@/lib/templates";
import type { DebtFull } from "@/lib/queries";
import { ActionForm } from "./ActionForm";
import { CopyButton } from "./CopyButton";

type Props = { d: DebtFull; negotiation: Negotiation | null; offers: Offer[]; contacts: Contact[] };

export function NegotiationPanel({ d, negotiation: n, offers, contacts }: Props) {
  const today = todayISO();
  const id = d.debt.id;

  if (!n) {
    return (
      <div className="panel">
        <h2>Negotiation</h2>
        <p className="note">Track the stages, offers and conversations with this creditor. Starting sets the debt&apos;s status to Negotiating.</p>
        <form action={startNegotiation.bind(null, id)}>
          <button className="btn" type="submit">Start tracking negotiation</button>
        </form>
        {(offers.length > 0 || contacts.length > 0) && <p className="note">Earlier offers and contacts are kept and will show here.</p>}
      </div>
    );
  }

  const sp = silenceProgress(n, today);
  const ctx = {
    debtName: d.debt.name,
    creditor: d.debt.creditor,
    entityName: d.entity.name,
    originalCents: d.debt.originalCents,
    agreedCents: d.settlement?.agreedCents ?? offers.find((o) => o.party === "us")?.amountCents ?? null,
    installments: d.settlement?.installments ?? offers.find((o) => o.party === "us")?.installments ?? null,
    today: fmtDate(today),
  };

  return (
    <>
      <div className="panel">
        <h2>Negotiation stage</h2>
        <div className="steps" role="list">
          {STAGES.map((s) => (
            <form key={s} action={setStage.bind(null, id, s)} role="listitem">
              <button type="submit" className={`step${n.stage === s ? " on" : ""}`} aria-current={n.stage === s ? "step" : undefined}>{STAGE_LABEL[s]}</button>
            </form>
          ))}
        </div>
        <p className="note">In this stage since {fmtDate(n.stageChangedOn)}.{n.stage === "accepted" && " Record the agreed terms in the Settlement section below."}</p>
        {sp && n.stage === "silence" && (
          <div>
            <div className="bar"><i style={{ width: `${Math.min(100, (sp.elapsed / sp.total) * 100)}%`, background: sp.left < 0 ? "var(--warn)" : "var(--accent)" }} /></div>
            <p className="note">
              Day {Math.min(sp.elapsed, sp.total)} of {sp.total}.{" "}
              {sp.left >= 0 ? `Planned end: ${fmtDate(sp.endsOn)} (${sp.left} days left).` : `Planned end was ${fmtDate(sp.endsOn)}.`}
            </p>
          </div>
        )}
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Timer and next action</summary>
          <div style={{ marginTop: 12 }}>
            <ActionForm action={updateNegotiation.bind(null, id)} submitLabel="Save">
              <label>Stage
                <select name="stage" defaultValue={n.stage}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
              </label>
              <label>Silence started<input type="date" name="silenceStartedOn" defaultValue={n.silenceStartedOn ?? ""} /></label>
              <label>Planned silence (days)<input type="number" name="silenceDays" min={1} max={730} defaultValue={n.silenceDays ?? ""} /></label>
              <label>Next action date<input type="date" name="nextActionOn" defaultValue={n.nextActionOn ?? ""} /></label>
              <label className="wide">Next action<input type="text" name="nextActionNote" defaultValue={n.nextActionNote} placeholder="Call settlement team about the counter-offer" /></label>
            </ActionForm>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--crit)" }}>Stop tracking this negotiation</summary>
              <form action={stopNegotiation.bind(null, id)} style={{ marginTop: 8 }}>
                <p className="note">Removes the stage and timers. Offers and contacts are kept.</p>
                <button className="btn danger small" type="submit">Stop tracking</button>
              </form>
            </details>
          </div>
        </details>
      </div>

      <div className="grid g2e">
        <div className="panel tablewrap">
          <h2>Offers and counter-offers</h2>
          {offers.length > 0 && (
            <table style={{ minWidth: 380 }}>
              <thead><tr><th>Date</th><th>From</th><th className="r">Amount</th><th>Terms</th><th /></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>{fmtDate(o.madeOn)}</td>
                    <td>{o.party === "us" ? "Us" : "Creditor"}</td>
                    <td className="r num">{usd(o.amountCents)}</td>
                    <td className="note">
                      {o.installments && o.installments > 1 ? `${o.installments} payments` : "Lump sum"}
                      {o.expiresOn ? `, expires ${fmtDate(o.expiresOn)}` : ""}
                      {o.note ? ` · ${o.note}` : ""}
                    </td>
                    <td className="r"><form action={deleteOffer.bind(null, o.id)}><button className="btn danger small" type="submit">Delete</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ marginTop: 16 }}>Log an offer</h2>
          <ActionForm action={addOffer.bind(null, id)} submitLabel="Add offer" resetOnSuccess>
            <label>Date<input type="date" name="madeOn" defaultValue={today} required /></label>
            <label>From
              <select name="party" defaultValue="us"><option value="us">Us</option><option value="creditor">Creditor</option></select>
            </label>
            <label>Amount ($)<input type="text" inputMode="decimal" name="amount" required /></label>
            <label>Number of payments<input type="number" name="installments" min={1} max={600} placeholder="1 = lump sum" /></label>
            <label>Expires on<input type="date" name="expiresOn" /></label>
            <label>Note<input type="text" name="note" /></label>
          </ActionForm>
        </div>

        <div className="panel">
          <h2>Contact log</h2>
          <div className="list">
            {contacts.length === 0 && <p className="note">No contacts logged yet.</p>}
            {contacts.map((c) => (
              <div className="item" key={c.id}>
                <div>
                  <b>{c.direction === "in" ? "Received" : "Sent"} · {c.channel}</b> <span className="note">{fmtDate(c.contactedOn)}</span>
                  <span className="sub2" style={{ color: "var(--fg)" }}>{c.summary}</span>
                </div>
                <form action={deleteContact.bind(null, c.id)}><button className="btn danger small" type="submit">Delete</button></form>
              </div>
            ))}
          </div>
          <h2 style={{ marginTop: 16 }}>Log a contact</h2>
          <ActionForm action={addContact.bind(null, id)} submitLabel="Add contact" resetOnSuccess>
            <label>Date<input type="date" name="contactedOn" defaultValue={today} required /></label>
            <label>Channel
              <select name="channel" defaultValue="phone">{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </label>
            <label>Direction
              <select name="direction" defaultValue="in"><option value="in">They contacted me</option><option value="out">I contacted them</option></select>
            </label>
            <label className="wide">Summary<textarea name="summary" placeholder="Who you spoke with and what was said" required /></label>
          </ActionForm>
        </div>
      </div>

      <details className="panel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Letter templates</summary>
        <p className="note" style={{ marginTop: 10 }}>Sample wording filled in from this debt. Edit before sending. These are starting points, not legal advice.</p>
        <div className="list">
          {TEMPLATES.map((t) => {
            const body = t.body(ctx);
            return (
              <div className="item" key={t.id} style={{ flexDirection: "column" }}>
                <div className="actions" style={{ justifyContent: "space-between" }}>
                  <div><b>{t.title}</b> <span className="note">{t.when}</span></div>
                  <CopyButton text={body} targetId={`tpl-${t.id}`} />
                </div>
                <pre id={`tpl-${t.id}`} className="tpl">{body}</pre>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}
