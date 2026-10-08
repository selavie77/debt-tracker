import Link from "next/link";
import { saveLivingCosts } from "@/app/plan-actions";
import { ActionForm } from "@/components/ActionForm";
import { Empty, Kpi, PageHead } from "@/components/Bits";
import { Simulator } from "@/components/Simulator";
import { todayISO } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { effectiveLivingCosts } from "@/lib/expenses";
import { usdWhole } from "@/lib/money";
import { buildPlan } from "@/lib/plan/build";
import { DISCLAIMER, TIER_INFO, monthLabel } from "@/lib/plan/guidance";
import { VIEW_DESCRIPTION, VIEW_LABEL, type IncomeView } from "@/lib/plan/income";
import { loadPlanData } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TIER_CHIP = { 1: "c-neg", 2: "c-kept", 3: "c-neutral" } as const;
const VIEWS: IncomeView[] = ["steady", "expected", "full"];
const HORIZONS = [12, 24, 36];

const money = (n: number) => (n < 0 ? `-${usdWhole(-n)}` : usdWhole(n));
const tone = (n: number | null) => (n == null ? undefined : n < 0 ? "var(--crit)" : "var(--good)");
const left = (n: number | null) => (n == null ? "enter living costs" : n >= 0 ? `${usdWhole(n)} left` : `${usdWhole(-n)} short`);

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ view?: string; months?: string }> }) {
  const { view, months } = await searchParams;
  const data = await withUser((db) => loadPlanData(db));
  const today = todayISO();
  const living = effectiveLivingCosts(data.expenses, data.settings?.livingCostsCents ?? null);
  const monthsN = HORIZONS.includes(Number(months)) ? Number(months) : 12;
  const plan = buildPlan({ ...data, livingCostsCents: living.cents, cashOnHandCents: data.settings?.cashOnHandCents ?? null, view, months: monthsN, today });
  const href = (v: IncomeView, m = monthsN) => `/plan?view=${v}&months=${m}`;

  if (plan.openCount === 0) {
    const none = data.debts.length === 0;
    return (
      <>
        <PageHead title="Your plan" />
        <Empty
          title={none ? "Add your debts first" : "No open debts"}
          text={none ? "The plan is built from your debts, payments and income." : "Everything is paid off or settled. Nothing to plan for right now."}
          href={none ? "/debts/new" : undefined}
          cta={none ? "Add a debt" : undefined}
        />
      </>
    );
  }

  const uncertain = plan.scenarios.hasVariable || plan.eventPlans.length > 0;

  return (
    <>
      <PageHead title="Your plan" sub="Where you stand, what to look at next, and what different choices would do to the numbers.">
        <Link className="btn ghost" href="/expect">Change what you expect</Link>
      </PageHead>
      <div className="msg" style={{ background: "var(--info-soft)", color: "var(--info)" }}>{DISCLAIMER}</div>

      <div className="panel">
        <h2>Where you stand</h2>
        <div className="story">{plan.story.map((p, i) => <p key={i}>{p}</p>)}</div>
        <div className="grid g4" style={{ marginTop: 14 }}>
          <Kpi label="Owed now" value={usdWhole(plan.owedCents)} sub={`${plan.openCount} open ${plan.openCount === 1 ? "debt" : "debts"}`} />
          <Kpi label="Debt payments" value={usdWhole(plan.monthlyObligationCents)} sub="scheduled each month" />
          <Kpi
            label="Income counted"
            value={plan.monthlyIncomeCents == null ? "not set" : usdWhole(plan.monthlyIncomeCents)}
            sub={plan.monthlyIncomeCents == null ? "add it on the Calendar page" : plan.scenarios.hasVariable ? VIEW_LABEL[plan.view].toLowerCase() : "each month"}
          />
          <Kpi
            label="Left after living costs"
            value={plan.surplusCents == null ? "not set" : money(plan.surplusCents)}
            sub={plan.surplusCents == null ? "enter your living costs below" : plan.surplusCents >= 0 ? "available for extra payments" : "short each month"}
            hero={plan.surplusCents != null && plan.surplusCents > 0}
          />
        </div>
      </div>

      {uncertain && (
        <div className="panel" id="income-views">
          <h2>How much to count on</h2>
          <p className="note">{VIEW_DESCRIPTION[plan.view]}</p>
          <div className="steps" style={{ marginTop: 8 }}>
            {VIEWS.map((v) => (
              <Link key={v} href={href(v)} className={`step${plan.view === v ? " on" : ""}`} aria-current={plan.view === v ? "true" : undefined}>{VIEW_LABEL[v]}</Link>
            ))}
          </div>
          {plan.scenarios.hasVariable && (
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table style={{ minWidth: 440 }}>
                <thead><tr><th>This month, counting</th><th className="r">Income</th><th className="r">After living costs and debt payments</th></tr></thead>
                <tbody>
                  {VIEWS.map((v) => (
                    <tr key={v} style={plan.view === v ? { background: "var(--accent-soft)" } : undefined}>
                      <td>{VIEW_LABEL[v]}</td>
                      <td className="r num">{usdWhole(plan.scenarios.steadyCents + (v === "full" ? plan.scenarios.fullCents : v === "expected" ? plan.scenarios.expectedCents : 0))}</td>
                      <td className="r num" style={{ color: tone(plan.surplusByView[v]) }}>{left(plan.surplusByView[v])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.breakEvenCents != null && (
            <p style={{ marginTop: 12 }}>
              {plan.breakEvenCents > 0
                ? <>With paychecks alone, the business has to bring in about <b>{usdWhole(plan.breakEvenCents)} a month</b> to cover living costs and scheduled debt payments.</>
                : <>Your paychecks alone cover living costs and scheduled debt payments.</>}
            </p>
          )}
          {plan.scenarios.hasVariable && !plan.scenarios.activeVariable && (
            <p className="note">None of your business forecasts cover this month, so only paychecks are counted now. <Link href="/expect">Update what you expect</Link>.</p>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Next steps</h2>
        {plan.steps.length === 0 ? (
          <p className="note">Nothing urgent. Check back after you log payments or contacts.</p>
        ) : (
          <ol className="steps-list">
            {plan.steps.map((s) => (
              <li key={s.id}>
                <Link href={s.href}><b>{s.title}</b></Link>
                <span className="sub2">{s.why}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {plan.eventPlans.filter((e) => e.direction === "in" && (e.payoffs.length > 0 || e.notCovered.length > 0)).map((e) => (
        <div className="panel" key={e.id}>
          <h2>If {e.name} happens in {monthLabel(e.month)}</h2>
          {!e.counted && (
            <p className="msg" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
              {plan.view === "steady"
                ? "This view counts no one-time events, so the month-by-month table below does not include it."
                : `You are ${e.confidencePercent}% sure, so the main view does not count it. It is in the best case.`}
            </p>
          )}
          <div className="grid g4">
            <Kpi label="Comes in" value={usdWhole(e.amountCents)} sub={`you are ${e.confidencePercent}% sure`} />
            <Kpi label="Pays off" value={usdWhole(e.payoffTotalCents)} sub={`${e.payoffs.length} ${e.payoffs.length === 1 ? "debt" : "debts"}`} />
            <Kpi label="Left over" value={usdWhole(e.proceedsAfterCents)} sub="cash after the payoffs" hero={e.proceedsAfterCents > 0} />
            <Kpi label="Payments that stop" value={usdWhole(e.monthlyFreedCents)} sub="a month, from the next month" />
          </div>
          {e.payoffs.length > 0 && (
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table style={{ minWidth: 380 }}>
                <thead><tr><th>Paid off, in this order</th><th className="r">About</th></tr></thead>
                <tbody>
                  {e.payoffs.map((p) => <tr key={p.debtId}><td><Link href={`/debts/${p.debtId}`}>{p.name}</Link></td><td className="r num">{usdWhole(p.costCents)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          {e.notCovered.length > 0 && (
            <div className="msg" style={{ background: "var(--warn-soft)", color: "var(--warn)", marginTop: 12 }}>
              The money does not reach {e.notCovered.map((p) => `${p.name} (${usdWhole(p.costCents)})`).join(" or ")}. Covering everything on your list would take about <b>{usdWhole(e.shortByCents)}</b> more.
              Those debts stay on the books and keep their payments.
            </div>
          )}
          {e.monthlyLeftBefore != null && e.monthlyLeftAfter != null && e.payoffs.length > 0 && (
            <p style={{ marginTop: 12 }}>
              The month after, with the income you are counting, the monthly picture goes from{" "}
              <b style={{ color: tone(e.monthlyLeftBefore) }}>{left(e.monthlyLeftBefore)}</b> to <b style={{ color: tone(e.monthlyLeftAfter) }}>{left(e.monthlyLeftAfter)}</b>
              {e.interestPerYearSavedCents > 0 ? `, and about ${usdWhole(e.interestPerYearSavedCents)} a year less interest accrues` : ""}.
            </p>
          )}
          {e.suggestion && (
            <p>
              <b>Options to consider:</b> the {usdWhole(e.suggestion.leftCents + e.suggestion.usedCents)} left over could also cover {e.suggestion.names.join(", ")} ({usdWhole(e.suggestion.usedCents)}), which would
              free another {usdWhole(e.suggestion.monthlyFreedCents)} a month{e.suggestion.interestPerYearSavedCents > 0 ? ` and save about ${usdWhole(e.suggestion.interestPerYearSavedCents)} a year in interest` : ""}. Keeping some as cash is another choice.
            </p>
          )}
          <p className="note">
            The plan pays debts off in the same order as the list further down (most serious first), as far as the money goes. These figures use today&apos;s balances, less settlement payments scheduled before then. Interest, penalties and fees change the real payoff amounts, so ask each creditor for an exact figure in writing.
          </p>
        </div>
      ))}
      {plan.outlook.length > 0 && (
        <div className="panel" id="outlook">
          <div className="head">
            <h2 style={{ margin: 0 }}>Month by month: {VIEW_LABEL[plan.view].toLowerCase()}</h2>
            <div className="steps">
              {HORIZONS.map((m) => (
                <Link key={m} href={href(plan.view, m)} className={`step${monthsN === m ? " on" : ""}`}>{m} months</Link>
              ))}
            </div>
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            Starting cash {usdWhole(plan.cashOnHandCents ?? 0)}{plan.cashOnHandCents == null ? " (not entered, so counted as $0)" : ""}. Living costs stay the same. Debt payments change as settlements end{plan.view !== "steady" ? " and as a sale or other event pays debts off" : ""}.
          </p>
          {plan.forecastEnding.length > 0 && (
            <p className="note" style={{ color: "var(--warn)" }}>
              {plan.forecastEnding.map((f) => `${f.name} ends before ${monthLabel(f.month)}`).join(". ")}. After that only paychecks are counted. <Link href="/expect">Add another forecast</Link> if you expect it to continue.
            </p>
          )}
          <div className="tablewrap">
            <table style={{ minWidth: 700 }}>
              <thead>
                <tr><th>Month</th><th className="r">Income</th><th className="r">Living</th><th className="r">Debt payments</th><th className="r">One-time</th><th className="r">Left</th><th className="r">Cash after</th></tr>
              </thead>
              <tbody>
                {plan.outlook.map((m) => {
                  const v = plan.view;
                  const income = m.steadyCents + (v === "full" ? m.fullCents : v === "expected" ? m.expectedCents : 0);
                  const flow = m.left[v] + m.events[v];
                  return (
                    <tr key={m.month} style={m.month === plan.runsOutMonth ? { background: "var(--crit-soft)" } : m.events[v] !== 0 ? { background: "var(--accent-soft)" } : undefined}>
                      <td>{monthLabel(m.month)}{m.month === plan.runsOutMonth && <span className="sub2" style={{ color: "var(--crit)" }}>cash runs out</span>}</td>
                      <td className="r num">{usdWhole(income)}</td>
                      <td className="r num">{usdWhole(m.livingCents)}</td>
                      <td className="r num">{usdWhole(m.obligations[v])}</td>
                      <td className="r num">{m.events[v] === 0 ? "" : money(m.events[v])}</td>
                      <td className="r num" style={{ color: tone(flow) }}>{money(flow)}</td>
                      <td className="r num" style={{ color: tone(m.balance[v]) }}><b>{money(m.balance[v])}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" id="cash">
        <h2>Your monthly living costs</h2>
        {living.source === "itemized" ? (
          <p>
            Using your itemized total of <b>{usdWhole(living.cents ?? 0)}</b> a month from {data.expenses.length} {data.expenses.length === 1 ? "cost" : "costs"}.{" "}
            <Link href="/living-costs">See the breakdown</Link>
          </p>
        ) : (
          <>
            <p className="note">
              Food, utilities, transport and other basics, plus rent if it is not already one of your debts. It is used only to work out what is left for debt.{" "}
              <Link href="/living-costs">Or list each cost separately</Link> to see where the money goes.
            </p>
            <ActionForm action={saveLivingCosts} submitLabel="Save">
              <label>Per month ($)
                <input type="text" id="living" name="living" inputMode="decimal" defaultValue={living.cents == null ? "" : String(living.cents / 100)} placeholder="2,400" />
              </label>
            </ActionForm>
          </>
        )}
      </div>

      <div className="panel">
        <h2>An order to look at your debts</h2>
        <p className="note">
          Sorted by how strongly a creditor can collect, then how late the debt is, then how much interest it costs. This is a general pattern to help you focus, not a legal ruling. It does not say what to do about any debt.
        </p>
        <div className="grid" style={{ gap: 12, marginTop: 12 }}>
          {plan.order.map((p, i) => (
            <div className="panel prio" key={p.debtId} style={{ background: "var(--surface2)" }}>
              <div className="head">
                <div>
                  <Link href={`/debts/${p.debtId}`}><b>{i + 1}. {p.name}</b></Link>
                  <span className="sub2">{p.typeLabel}</span>
                </div>
                <span className={`chip ${TIER_CHIP[p.tier]}`} title={TIER_INFO[p.tier].reason}>{TIER_INFO[p.tier].label}</span>
              </div>
              <ul className="checks">{p.facts.map((f, j) => <li key={j}>{f}</li>)}</ul>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Options to consider and questions to ask</summary>
                <div className="grid g2e" style={{ marginTop: 10 }}>
                  <div><h2>Options to consider</h2><ul className="checks">{p.options.map((o, j) => <li key={j}>{o}</li>)}</ul></div>
                  <div><h2>Questions to ask</h2><ul className="checks">{p.questions.map((q, j) => <li key={j}>{q}</li>)}</ul></div>
                </div>
                <p className="note" style={{ marginTop: 8 }}>{TIER_INFO[p.tier].reason}</p>
              </details>
            </div>
          ))}
        </div>
      </div>

      <div id="simulator">
        <Simulator debts={plan.simDebts} excluded={plan.excluded} defaultExtraCents={plan.defaultExtraCents} surplusCents={plan.surplusCents} whatIf={plan.whatIf} today={today} />
      </div>

      {plan.facts.length > 0 && (
        <div className="panel">
          <h2>Did you know</h2>
          <div className="grid g2e">
            {plan.facts.map((f) => (
              <div key={f.id} className="fact">
                <b>{f.title}</b>
                <p>{f.text}</p>
                <span className="note">Applies to: {f.about.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="note">{DISCLAIMER}</p>
    </>
  );
}
