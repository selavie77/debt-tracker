import Link from "next/link";
import { saveTaxItem } from "@/app/negotiation-actions";
import { ActionForm } from "@/components/ActionForm";
import { Empty, Kpi, PageHead } from "@/components/Bits";
import { fmtDate } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { usdWhole } from "@/lib/money";
import { listDebts, listTaxItems } from "@/lib/queries";
import { FORM_THRESHOLD_CENTS, pendingTaxCount, taxFlags, totalsByYear } from "@/lib/tax";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const [debts, items] = await withUser((db) => Promise.all([listDebts(db), listTaxItems(db)]));
  const flags = taxFlags(debts);
  const item = new Map(items.map((i) => [i.debtId, i]));
  const reviewed = new Set(items.filter((i) => i.reviewedWithPro).map((i) => i.debtId));
  const years = totalsByYear(flags);
  const cancellations = flags.filter((f) => f.kind === "cancellation");
  const taxDebts = flags.filter((f) => f.kind === "tax_debt");
  const pending = pendingTaxCount(flags, reviewed);

  return (
    <>
      <PageHead title="Tax review" sub="Settled debts that may have tax consequences, so nothing is forgotten at filing time." />
      <div className="msg" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
        This is a reminder list, not tax advice. Whether forgiven debt counts as income depends on the type of debt, who owes it, the year, and your circumstances (for example, insolvency). Review each item with a tax professional.
      </div>
      {flags.length === 0 ? (
        <Empty title="Nothing to review yet" text="When a debt has a settlement for less than the balance, it appears here." />
      ) : (
        <>
          <div className="grid g4">
            <Kpi label="Settled debts flagged" value={String(flags.length)} sub={`${pending} not yet reviewed with a professional`} />
            <Kpi label="Debt forgiven, loans and cards" value={usdWhole(cancellations.reduce((s, f) => s + f.forgivenCents, 0))} sub="amount below the original balance" />
            <Kpi label="Reduced tax debts" value={String(taxDebts.length)} sub="different rules, ask your professional" />
            <Kpi label="Likely forms" value={String(cancellations.filter((f) => f.mayGetForm).length)} sub={`creditors usually report ${usdWhole(FORM_THRESHOLD_CENTS)} or more`} />
          </div>

          {years.length > 0 && (
            <div className="panel tablewrap">
              <h2>By year of final payment</h2>
              <table style={{ minWidth: 360 }}>
                <thead><tr><th>Year</th><th className="r">Debts</th><th className="r">Forgiven</th></tr></thead>
                <tbody>
                  {years.map((y) => <tr key={y.year}><td>{y.year}</td><td className="r num">{y.count}</td><td className="r num">{usdWhole(y.forgivenCents)}</td></tr>)}
                </tbody>
              </table>
              <p className="note">The year debt is treated as discharged can differ from the year of the final payment. Confirm with your tax professional.</p>
            </div>
          )}

          {[
            { title: "Loans and cards", list: cancellations },
            { title: "Reduced tax debts", list: taxDebts },
          ].map(({ title, list }) =>
            list.length === 0 ? null : (
              <div key={title} className="grid">
                <h2 style={{ margin: "4px 0 0" }}>{title}</h2>
                {list.map((f) => {
                  const it = item.get(f.debtId);
                  return (
                    <div className="panel" key={f.debtId}>
                      <div className="head">
                        <div>
                          <Link href={`/debts/${f.debtId}`}><b>{f.name}</b></Link>
                          <span className="sub2">{f.entityName} &middot; agreed {fmtDate(f.agreedOn)} &middot; {f.paidOff ? "paid off" : "final payment"} {fmtDate(f.finalPaymentOn)}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="num" style={{ fontSize: 20 }}>{usdWhole(f.forgivenCents)}</div>
                          <span className="note">{f.kind === "tax_debt" ? "reduced" : "forgiven"}</span>
                        </div>
                      </div>
                      <p className="note">
                        {f.kind === "tax_debt"
                          ? "Reduced tax debts generally follow different rules from forgiven loans. Ask your tax professional how this one is treated."
                          : f.mayGetForm
                            ? "The creditor may send a Form 1099-C. Ask for a paid-in-full letter and whether they will file one. An insolvency exclusion (Form 982) may apply in some cases."
                            : "Below the usual reporting amount, but the forgiven amount can still matter. Ask your tax professional."}
                      </p>
                      <ActionForm action={saveTaxItem.bind(null, f.debtId)} submitLabel="Save">
                        {f.kind === "cancellation" && (
                          <label className="check"><input type="checkbox" name="formReceived" defaultChecked={it?.formReceived} /> Form received from the creditor</label>
                        )}
                        <label className="check"><input type="checkbox" name="reviewedWithPro" defaultChecked={it?.reviewedWithPro} /> Reviewed with a tax professional</label>
                        <label className="wide">Note<input type="text" name="note" defaultValue={it?.note} placeholder="What your professional said, or what to ask" /></label>
                      </ActionForm>
                    </div>
                  );
                })}
              </div>
            ),
          )}
        </>
      )}
    </>
  );
}
