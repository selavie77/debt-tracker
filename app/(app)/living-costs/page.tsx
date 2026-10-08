import { addExpense, clearExpenses, deleteExpense, updateExpense } from "@/app/expense-actions";
import { saveLivingCosts } from "@/app/plan-actions";
import { ActionForm } from "@/components/ActionForm";
import { Kpi, PageHead } from "@/components/Bits";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ActionButton } from "@/components/TestEmailButton";
import { todayISO } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { planSettings } from "@/lib/db/schema";
import { CATEGORY_LABEL, FREQUENCY_LABEL, byCategory, effectiveLivingCosts, monthlyCents } from "@/lib/expenses";
import { usd, usdWhole } from "@/lib/money";
import { defaultView, incomeForView, incomeScenarios } from "@/lib/plan/income";
import { listExpenses, listIncome } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LivingCostsPage() {
  const { items, income, settings } = await withUser(async (db) => ({
    items: await listExpenses(db),
    income: await listIncome(db),
    settings: (await db.select().from(planSettings))[0] ?? null,
  }));
  const single = settings?.livingCostsCents ?? null;
  const living = effectiveLivingCosts(items, single);
  // Paychecks plus any business income at your confidence, the same careful level the plan starts with.
  const scenarios = incomeScenarios(income, todayISO().slice(0, 7));
  const monthlyIncome = income.length ? incomeForView(scenarios, defaultView(scenarios)) : null;
  const cats = byCategory(items);
  const sorted = [...items].sort((a, b) => monthlyCents(b.amountCents, b.frequency) - monthlyCents(a.amountCents, a.frequency));
  const top = cats[0];

  return (
    <>
      <PageHead title="Living costs" sub="What you spend each month before debt payments. The plan uses this total to work out what is left for debt." />

      <div className="grid g4">
        <Kpi label="Per month" value={living.cents == null ? "not set" : usdWhole(living.cents)} sub={living.source === "itemized" ? `from ${items.length} ${items.length === 1 ? "cost" : "costs"}` : living.source === "single" ? "a single total you entered" : "add costs below"} />
        <Kpi label="Per year" value={living.cents == null ? "not set" : usdWhole(living.cents * 12)} sub="12 months of the above" />
        <Kpi label="Share of income" value={living.cents != null && monthlyIncome ? `${Math.round((living.cents / monthlyIncome) * 100)}%` : "n/a"} sub={monthlyIncome ? `of ${usdWhole(monthlyIncome)} a month` : "add income on the Calendar page"} />
        <Kpi label="Biggest category" value={top ? `${top.percent}%` : "n/a"} sub={top ? CATEGORY_LABEL[top.category] : "itemize to see"} />
      </div>

      {items.length > 0 && (
        <div className="panel">
          <h2>Where it goes</h2>
          <div className="catlist">
            {cats.map((c) => (
              <div className="cat" key={c.category}>
                <div className="catrow">
                  <span>{CATEGORY_LABEL[c.category]} <span className="note">({c.count})</span></span>
                  <span className="num">{usd(c.monthlyCents)} <span className="note">{c.percent}%</span></span>
                </div>
                <div className="bar" role="img" aria-label={`${CATEGORY_LABEL[c.category]}: ${c.percent} percent of living costs`}>
                  <i style={{ width: `${c.percent}%`, background: "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>{items.length ? "Add another cost" : "Add each cost"}</h2>
        <p className="note">
          Pick a quick-add button or type your own, then enter the amount and how often you pay it. Weekly, every-two-weeks, quarterly and yearly costs are turned into an average month. Leave out debts you already track here, such as a mortgage or car loan.
        </p>
        <ExpenseForm action={addExpense} submitLabel="Add cost" idPrefix="add" presets />
      </div>

      {items.length > 0 && (
        <div className="panel tablewrap">
          <h2>Your costs</h2>
          <table style={{ minWidth: 560 }}>
            <thead>
              <tr><th>Cost</th><th>How often</th><th className="r">Amount</th><th className="r">Per month</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <details className="exp">
                      <summary>
                        <span><b>{e.name}</b><span className="sub2">{CATEGORY_LABEL[e.category]}</span></span>
                        <span className="note">{FREQUENCY_LABEL[e.frequency]}</span>
                        <span className="num">{usd(e.amountCents)}</span>
                        <span className="num"><b>{usd(monthlyCents(e.amountCents, e.frequency))}</b></span>
                        <span className="link">Edit</span>
                      </summary>
                      <div className="exp-body">
                        <ExpenseForm action={updateExpense.bind(null, e.id)} submitLabel="Save changes" idPrefix={`e-${e.id}`} initial={e} />
                        <form action={deleteExpense.bind(null, e.id)} style={{ marginTop: 8 }}>
                          <button className="btn danger small" type="submit">Delete {e.name}</button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h2>{items.length ? "A single total instead" : "Or enter one total"}</h2>
        {items.length > 0 ? (
          <>
            <p className="note">
              Your itemized costs are in use{single != null ? `, so the single total you entered earlier (${usd(single)} a month) is ignored` : ""}. To go back to one number, clear the itemized list.
            </p>
            <details>
              <summary style={{ cursor: "pointer", color: "var(--crit)" }}>Clear all itemized costs...</summary>
              <p className="note" style={{ marginTop: 8 }}>This permanently deletes all {items.length} costs above.</p>
              <ActionButton action={clearExpenses} label="Yes, clear them" className="btn danger small" />
            </details>
          </>
        ) : (
          <>
            <p className="note">If you would rather not itemize, enter your monthly total here. You can itemize later and the list will replace it.</p>
            <ActionForm action={saveLivingCosts} submitLabel="Save total">
              <label>Per month ($)
                <input type="text" id="living" name="living" inputMode="decimal" defaultValue={single == null ? "" : String(single / 100)} placeholder="2,400" />
              </label>
            </ActionForm>
          </>
        )}
      </div>
    </>
  );
}
