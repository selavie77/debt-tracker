import Link from "next/link";
import { saveLivingCosts } from "@/app/plan-actions";
import { ActionForm } from "@/components/ActionForm";
import { Empty, Kpi, PageHead } from "@/components/Bits";
import { Simulator } from "@/components/Simulator";
import { todayISO } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { planSettings } from "@/lib/db/schema";
import { effectiveLivingCosts } from "@/lib/expenses";
import { usdWhole } from "@/lib/money";
import { buildPlan } from "@/lib/plan/build";
import { DISCLAIMER, TIER_INFO } from "@/lib/plan/guidance";
import { listDebts, listExpenses, listIncome, listNegotiations, listOffers, listTaxItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TIER_CHIP = { 1: "c-neg", 2: "c-kept", 3: "c-neutral" } as const;

export default async function PlanPage() {
  const data = await withUser(async (db) => ({
    debts: await listDebts(db),
    negs: await listNegotiations(db),
    offers: await listOffers(db),
    income: await listIncome(db),
    taxRows: await listTaxItems(db),
    expenses: await listExpenses(db),
    settings: (await db.select().from(planSettings))[0] ?? null,
  }));
  const today = todayISO();
  const living = effectiveLivingCosts(data.expenses, data.settings?.livingCostsCents ?? null);
  const plan = buildPlan({ ...data, livingCostsCents: living.cents, today });

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

  return (
    <>
      <PageHead title="Your plan" sub="Where you stand, what to look at next, and what different choices would do to the numbers." />
      <div className="msg" style={{ background: "var(--info-soft)", color: "var(--info)" }}>{DISCLAIMER}</div>

      <div className="panel">
        <h2>Where you stand</h2>
        <div className="story">{plan.story.map((p, i) => <p key={i}>{p}</p>)}</div>
        <div className="grid g4" style={{ marginTop: 14 }}>
          <Kpi label="Owed now" value={usdWhole(plan.owedCents)} sub={`${plan.openCount} open ${plan.openCount === 1 ? "debt" : "debts"}`} />
          <Kpi label="Debt payments" value={usdWhole(plan.monthlyObligationCents)} sub="scheduled each month" />
          <Kpi label="Income" value={plan.monthlyIncomeCents == null ? "not set" : usdWhole(plan.monthlyIncomeCents)} sub={plan.monthlyIncomeCents == null ? "add it on the Calendar page" : "each month"} />
          <Kpi
            label="Left after living costs"
            value={plan.surplusCents == null ? "not set" : usdWhole(plan.surplusCents)}
            sub={plan.surplusCents == null ? "enter your living costs below" : plan.surplusCents >= 0 ? "available for extra payments" : "short each month"}
            hero={plan.surplusCents != null && plan.surplusCents > 0}
          />
        </div>
      </div>

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
