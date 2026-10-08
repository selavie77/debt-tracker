import Link from "next/link";
import { deleteEvent, deleteForecast, saveCashOnHand } from "@/app/expect-actions";
import { ActionForm } from "@/components/ActionForm";
import { EventForm } from "@/components/EventForm";
import { ForecastForm } from "@/components/ForecastForm";
import { PageHead } from "@/components/Bits";
import { todayISO } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { effectiveLivingCosts } from "@/lib/expenses";
import { usd, usdWhole } from "@/lib/money";
import { buildPlan } from "@/lib/plan/build";
import { confidenceLabel } from "@/lib/plan/income";
import { monthLabel } from "@/lib/plan/guidance";
import { loadPlanData } from "@/lib/queries";

export const dynamic = "force-dynamic";

const period = (starts: string | null, ends: string | null) =>
  starts && ends ? `${monthLabel(starts.slice(0, 7))} to ${monthLabel(ends.slice(0, 7))}` : starts ? `from ${monthLabel(starts.slice(0, 7))}, no end date` : "no dates set";

export default async function ExpectPage() {
  const data = await withUser((db) => loadPlanData(db));
  const today = todayISO();
  const month = today.slice(0, 7);
  const living = effectiveLivingCosts(data.expenses, data.settings?.livingCostsCents ?? null);
  const plan = buildPlan({ ...data, livingCostsCents: living.cents, cashOnHandCents: data.settings?.cashOnHandCents ?? null, today });
  const openDebts = data.debts.filter((d) => d.owed > 0 && d.debt.status !== "paid").sort((a, b) => b.owed - a.owed).map((d) => ({ id: d.debt.id, name: d.debt.name, owedCents: d.owed }));

  return (
    <>
      <PageHead title="What you expect" sub="Your best guess about the next months: business income, a property sale, a large bill. Each has a confidence level, and the plan counts the amount times that confidence." />
      <div className="msg" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
        These are your own guesses, not facts. The plan shows what happens if they come true and what happens if they do not. <Link href="/plan#outlook">See the month-by-month outlook</Link>
      </div>

      <div className="panel">
        <h2>Cash and savings you have today</h2>
        <p className="note">The starting point for the outlook. If your monthly shortfall is bigger than your cash, the plan shows the month it runs out.</p>
        <ActionForm action={saveCashOnHand} submitLabel="Save">
          <label>Available now ($)
            <input type="text" id="cash" name="cash" inputMode="decimal" defaultValue={data.settings?.cashOnHandCents == null ? "" : String(data.settings.cashOnHandCents / 100)} placeholder="8,000" />
          </label>
        </ActionForm>
      </div>

      <div className="panel">
        <h2>Business income you expect</h2>
        {plan.forecasts.length === 0 ? (
          <p className="note">Nothing yet. Add what you think the business will bring in, how sure you are, and for how long.</p>
        ) : (
          <div className="list">
            {plan.forecasts.map((f) => (
              <div className="item" key={f.id}>
                <div>
                  <b>{f.name}</b>{f.entityName && <span className="note"> · {f.entityName}</span>}
                  <span className="sub2">
                    {usd(f.amountCents)} a month at {f.confidencePercent}% confidence ({confidenceLabel(f.confidencePercent)}), so the plan counts {usd(f.expectedCents)}. {period(f.startsOn, f.endsOn)}.
                  </span>
                </div>
                <form action={deleteForecast.bind(null, f.id)}><button className="btn danger small" type="submit">Delete</button></form>
              </div>
            ))}
          </div>
        )}
        <h2 style={{ marginTop: 16 }}>Add a forecast</h2>
        <ForecastForm entities={data.entities} defaultMonth={month} />
        {data.entities.every((e) => e.kind !== "business") && (
          <p className="note">To link it to your business, <Link href="/entities">add the business as an entity</Link> first.</p>
        )}
      </div>

      <div className="panel">
        <h2>One-time events you expect</h2>
        {plan.eventPlans.length === 0 ? (
          <p className="note">Nothing yet. A property sale, a tax refund or a large bill goes here. An event can also pay off specific debts.</p>
        ) : (
          <div className="list">
            {plan.eventPlans.map((e) => (
              <div className="item" key={e.id}>
                <div>
                  <b>{e.name}</b>
                  <span className="sub2">
                    {e.direction === "in" ? "Money in" : "Money out"}: {usd(e.amountCents)} in {monthLabel(e.month)} at {e.confidencePercent}% confidence, so the plan counts {usd(Math.abs(e.expectedCents))}.
                  </span>
                  {e.payoffs.length > 0 && (
                    <span className="sub2">
                      Would pay off {e.payoffs.map((p) => `${p.name} (${usdWhole(p.costCents)})`).join(", ")}. {e.proceedsAfterCents >= 0 ? `About ${usdWhole(e.proceedsAfterCents)} would be left.` : `It falls short by about ${usdWhole(-e.proceedsAfterCents)}.`}
                    </span>
                  )}
                  {e.note && <span className="sub2">{e.note}</span>}
                </div>
                <form action={deleteEvent.bind(null, e.id)}><button className="btn danger small" type="submit">Delete</button></form>
              </div>
            ))}
          </div>
        )}
        <h2 style={{ marginTop: 16 }}>Add an event</h2>
        <EventForm debts={openDebts} defaultMonth={month} />
      </div>
    </>
  );
}
