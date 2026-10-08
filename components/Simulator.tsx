"use client";

import { useMemo, useState } from "react";
import { addMonths } from "@/lib/dates";
import { toCents, usd, usdWhole } from "@/lib/money";
import { compareExtra, settlementWhatIf, type SimDebt, type Strategy } from "@/lib/plan/simulate";

import type { WhatIfDebt } from "@/lib/plan/build";

type Props = {
  debts: SimDebt[];
  excluded: { name: string; reason: string }[];
  defaultExtraCents: number;
  surplusCents: number | null;
  whatIf: WhatIfDebt[];
  today: string;
};

const monthLabel = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

export function Simulator({ debts, excluded, defaultExtraCents, surplusCents, whatIf, today }: Props) {
  const [extra, setExtra] = useState(String(defaultExtraCents / 100));
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const extraCents = Math.max(0, Number.isFinite(toCents(extra)) ? toCents(extra) : 0);

  const cmp = useMemo(() => (debts.length ? compareExtra(debts, extraCents, strategy) : null), [debts, extraCents, strategy]);
  const when = (months: number | null) => (months == null ? "not within 50 years" : monthLabel(addMonths(today, months)));

  const [debtId, setDebtId] = useState(whatIf[0]?.id ?? "");
  const [offer, setOffer] = useState("");
  const [payments, setPayments] = useState("12");
  const target = whatIf.find((d) => d.id === debtId);
  const offerCents = Number.isFinite(toCents(offer)) ? toCents(offer) : 0;
  const wi = target && offerCents > 0 ? settlementWhatIf(target.owedCents, offerCents, Number(payments) || 1) : null;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="panel">
        <h2>If you pay extra each month</h2>
        {!cmp ? (
          <p className="note">Add a rate and monthly payment to a debt to include it here.</p>
        ) : (
          <>
            <div className="form" style={{ marginBottom: 12 }}>
              <label>Extra per month ($)
                <input type="text" id="sim-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </label>
              <label>Which debt first
                <select id="sim-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
                  <option value="avalanche">Highest rate first (least interest)</option>
                  <option value="snowball">Smallest balance first (quick wins)</option>
                </select>
              </label>
              <div className="actions" style={{ alignSelf: "end" }}>
                {[10_000, 25_000, 50_000].map((c) => (
                  <button key={c} type="button" className="btn ghost small" onClick={() => setExtra(String(c / 100))}>{usdWhole(c)}</button>
                ))}
              </div>
            </div>
            {surplusCents != null && extraCents > Math.max(0, surplusCents) && (
              <div className="msg" style={{ background: "var(--warn-soft)", color: "var(--warn)", marginBottom: 12 }}>
                That is more than the {usdWhole(Math.max(0, surplusCents))} a month left after living costs and scheduled payments.
              </div>
            )}
            <div className="grid g4">
              <div className="kpi"><div className="v">{when(cmp.withExtra.capped ? null : cmp.withExtra.months)}</div><div className="l"><b>Last of these debts paid</b><br />{extraCents ? `with ${usdWhole(extraCents)} extra` : "at current payments"}</div></div>
              <div className="kpi"><div className="v" style={{ color: "var(--good)" }}>{usdWhole(cmp.interestSavedCents)}</div><div className="l"><b>Interest saved</b><br />vs. payments as they are</div></div>
              <div className="kpi"><div className="v">{cmp.monthsSaved}</div><div className="l"><b>{cmp.monthsSaved === 1 ? "Month" : "Months"} sooner</b><br />{when(cmp.baseline.capped ? null : cmp.baseline.months)} otherwise</div></div>
              <div className="kpi"><div className="v">{usdWhole(cmp.withExtra.totalInterestCents)}</div><div className="l"><b>Interest still to pay</b><br />{usdWhole(cmp.baseline.totalInterestCents)} otherwise</div></div>
            </div>
            {(cmp.baseline.stuck.length > 0 || cmp.withExtra.stuck.length > 0) && (
              <p className="msg err">
                For {debts.filter((d) => cmp.baseline.stuck.includes(d.id)).map((d) => d.name).join(", ")}, the monthly payment does not cover the interest, so the balance does not go down on its own.
              </p>
            )}
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table style={{ minWidth: 460 }}>
                <thead><tr><th>Debt</th><th className="r">Paid off now</th><th className="r">Paid off with extra</th><th className="r">Interest saved</th></tr></thead>
                <tbody>
                  {debts.map((d) => {
                    const a = cmp.baseline.perDebt.find((x) => x.id === d.id)!;
                    const b = cmp.withExtra.perDebt.find((x) => x.id === d.id)!;
                    return (
                      <tr key={d.id}>
                        <td>{d.name}{d.fixed && <span className="sub2">settled, fixed schedule</span>}</td>
                        <td className="r num">{when(a.payoffMonth)}</td>
                        <td className="r num">{when(b.payoffMonth)}</td>
                        <td className="r num">{usdWhole(Math.max(0, a.interestCents - b.interestCents))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">
              Assumes the rates and payments you entered stay the same. Extra money goes to one debt at a time. When a debt is paid off, its payment moves to the next one. Settled debts keep their fixed schedule.
            </p>
          </>
        )}
        {excluded.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", color: "var(--muted)" }}>{excluded.length} {excluded.length === 1 ? "debt is" : "debts are"} not included</summary>
            <ul className="checks" style={{ marginTop: 8 }}>
              {excluded.map((e) => <li key={e.name}><b>{e.name}</b>: {e.reason}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="panel">
        <h2>If you offered a settlement</h2>
        {whatIf.length === 0 ? (
          <p className="note">No open debts without a settlement to try this on.</p>
        ) : (
          <>
            <div className="form" style={{ marginBottom: 12 }}>
              <label>Debt
                <select id="wi-debt" value={debtId} onChange={(e) => setDebtId(e.target.value)}>
                  {whatIf.map((d) => <option key={d.id} value={d.id}>{d.name} ({usdWhole(d.owedCents)})</option>)}
                </select>
              </label>
              <label>Offer ($)
                <input type="text" id="wi-offer" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Amount you would pay in total" />
              </label>
              <label>Number of payments
                <input type="number" id="wi-payments" min={1} max={120} value={payments} onChange={(e) => setPayments(e.target.value)} />
              </label>
            </div>
            {wi && target ? (
              <>
                <div className="grid g4">
                  <div className="kpi"><div className="v">{usdWhole(wi.offerCents)}</div><div className="l"><b>You would pay</b><br />{wi.percentOfBalance}% of {usdWhole(target.owedCents)}</div></div>
                  <div className="kpi"><div className="v" style={{ color: "var(--good)" }}>{usdWhole(wi.eliminatedCents)}</div><div className="l"><b>Balance reduced by</b><br />if it were accepted</div></div>
                  <div className="kpi"><div className="v">{usd(wi.installmentCents)}</div><div className="l"><b>Per month</b><br />over {wi.installments} {wi.installments === 1 ? "payment" : "payments"}</div></div>
                  <div className="kpi">
                    <div className="v">{surplusCents == null ? "n/a" : usdWhole(surplusCents - wi.installmentCents)}</div>
                    <div className="l"><b>Left each month after it</b><br />{surplusCents == null ? "add income and living costs" : `from ${usdWhole(surplusCents)} before`}</div>
                  </div>
                </div>
                <p className="note" style={{ marginTop: 10 }}>
                  {target.isTax
                    ? "Reduced tax debts follow different rules from forgiven loans. Ask a tax professional how this would be treated."
                    : wi.eliminatedCents >= 60_000
                      ? "The amount forgiven may count as taxable income, and the creditor may report it. See Tax review and ask a tax professional."
                      : "Even a smaller forgiven amount can matter at tax time. Ask a tax professional."}
                </p>
              </>
            ) : (
              <p className="note">Enter an amount to see what it would mean for the balance and your monthly cash.</p>
            )}
            <p className="note">This only does the arithmetic. It does not predict what a creditor would accept, or whether it is the right move for you.</p>
          </>
        )}
      </div>
    </div>
  );
}
