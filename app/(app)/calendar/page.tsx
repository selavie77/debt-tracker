import Link from "next/link";
import { deleteIncome } from "@/app/negotiation-actions";
import { Kpi, PageHead } from "@/components/Bits";
import { IncomeForm } from "@/components/IncomeForm";
import { dayOfMonthLabel, monthEvents, monthTotals, shiftMonth, type CalEvent } from "@/lib/calendar";
import { fmtDate, todayISO } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { usd, usdWhole } from "@/lib/money";
import { listDebts, listIncome } from "@/lib/queries";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<CalEvent["kind"], string> = { income: "Income", paid: "Paid", due: "Due", late: "Overdue" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const today = todayISO();
  const { m } = await searchParams;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const [debts, incomeRows] = await withUser((db) => Promise.all([listDebts(db), listIncome(db)]));

  const events = monthEvents(debts.map((d) => ({ ...d, id: d.debt.id, name: d.debt.name })), incomeRows, month, today);
  const totals = monthTotals(events);
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1).getDay();
  const days = new Date(y, mo, 0).getDate();
  const title = new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const byDay = new Map<string, CalEvent[]>();
  events.forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]));

  return (
    <>
      <PageHead title="Cash-flow calendar" sub="Scheduled debt payments against the income you enter below.">
        <div className="actions">
          <Link className="btn ghost small" href={`/calendar?m=${shiftMonth(month, -1)}`}>&larr; Prev</Link>
          <b style={{ minWidth: 130, textAlign: "center" }}>{title}</b>
          <Link className="btn ghost small" href={`/calendar?m=${shiftMonth(month, 1)}`}>Next &rarr;</Link>
          {month !== today.slice(0, 7) && <Link className="btn ghost small" href="/calendar">This month</Link>}
        </div>
      </PageHead>

      <div className="grid g4">
        <Kpi label="Income" value={usdWhole(totals.income)} sub={incomeRows.length ? `${incomeRows.length} deposit${incomeRows.length > 1 ? "s" : ""} a month` : "none entered yet"} />
        <Kpi label="Debt payments" value={usdWhole(totals.paid + totals.toPay)} sub={`${usdWhole(totals.paid)} paid, ${usdWhole(totals.toPay)} to pay`} />
        <Kpi label="Left after payments" value={usdWhole(totals.leftAfter)} sub={totals.leftAfter >= 0 ? "before living costs" : "shortfall this month"} hero={totals.leftAfter >= 0 && totals.income > 0} />
        <Kpi label="Overdue" value={usdWhole(events.filter((e) => e.kind === "late").reduce((s, e) => s + e.amountCents, 0))} sub="scheduled before today, not logged" />
      </div>

      <div className="panel">
        <div className="cal" role="grid" aria-label={title}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((n) => <div className="dow" key={n}>{n}</div>)}
          {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const dd = i + 1;
            const key = `${month}-${String(dd).padStart(2, "0")}`;
            const ev = byDay.get(key) ?? [];
            return (
              <div className={`day${key === today ? " today" : ""}`} key={key}>
                <span className="n">{dd}</span>
                {ev.map((e, j) => (
                  <div key={j} className={`ev ev-${e.kind}`} title={`${KIND_LABEL[e.kind]}: ${e.label} ${usd(e.amountCents)}`}>
                    {usdWhole(e.amountCents)} {e.label}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><b style={{ background: "var(--good)" }} />Income</span>
          <span><b style={{ background: "var(--accent)" }} />Due</span>
          <span><b style={{ background: "var(--crit)" }} />Overdue</span>
          <span><b style={{ background: "var(--muted)" }} />Paid</span>
        </div>
      </div>

      <div className="grid g2e">
        <div className="panel">
          <h2>{title} in order</h2>
          <div className="list">
            {events.length === 0 && <p className="note">Nothing scheduled this month.</p>}
            {events.map((e, i) => (
              <div className="item" key={i}>
                <div>
                  {e.debtId ? <Link href={`/debts/${e.debtId}`}>{e.label}</Link> : e.label}
                  <span className="sub2">{fmtDate(e.date)} · {KIND_LABEL[e.kind]}</span>
                </div>
                <span className="num" style={{ color: e.kind === "late" ? "var(--crit)" : e.kind === "income" ? "var(--good)" : undefined }}>
                  {e.kind === "income" ? "+" : ""}{usd(e.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>Income</h2>
          <div className="list">
            {incomeRows.length === 0 && <p className="note">Add what you expect to receive, such as a paycheck on the 15th and the last day of the month, to see what is left after debt payments.</p>}
            {incomeRows.map((r) => (
              <div className="item" key={r.id}>
                <div>{r.name}<span className="sub2">on {dayOfMonthLabel(r.dayOfMonth)} each month</span></div>
                <div className="actions">
                  <span className="num">{usd(r.amountCents)}</span>
                  <form action={deleteIncome.bind(null, r.id)}><button className="btn danger small" type="submit">Delete</button></form>
                </div>
              </div>
            ))}
          </div>
          <h2 style={{ marginTop: 16 }}>Add income</h2>
          <IncomeForm />
        </div>
      </div>
    </>
  );
}
