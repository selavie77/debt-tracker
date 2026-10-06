import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Chart } from "@/components/Chart";
import { balanceSteps } from "@/lib/finance";
import { usdWhole } from "@/lib/money";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/negotiation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "The Debt Playbook",
  description: "A tracker for large, mixed debt: back taxes, business loans, cards and secured loans. Follow every balance, offer and payment in one place.",
};

// Example only: a $155,000 loan settled at $50,000 over 36 payments, shown after 12 payments.
const EXAMPLE = {
  debt: { originalCents: 15_500_000, rateBps: 1700, status: "settled", monthlyPaymentCents: null, paymentDay: null },
  settlement: { agreedCents: 5_000_000, installmentCents: 138_889, installments: 36, agreedOn: "2025-12-20", firstPaymentOn: "2026-01-15" },
  payments: Array.from({ length: 12 }, (_, i) => ({ paidOn: `2026-${String(i + 1).padStart(2, "0")}-15`, amountCents: 138_889, interestCents: 0 })),
};

const FEATURES: { title: string; text: string }[] = [
  { title: "Balances that go down", text: "Log a payment and watch the balance fall. A settlement shows the original amount, the agreed amount and what was eliminated." },
  { title: "A negotiation pipeline", text: "Seven stages from silence period to closed, with timers, offers, counter-offers and expiry dates, so nothing lapses unnoticed." },
  { title: "Every contact on record", text: "Date, channel and what was said, kept next to the debt it belongs to. Sample letters fill in from the debt for you to edit." },
  { title: "A cash-flow calendar", text: "Every scheduled payment next to your income for the month, with overdue ones marked." },
  { title: "Side-by-side facts", text: "Compare debts on rate, collateral, guarantees, government backing and days late. You get facts and things to check, never advice." },
  { title: "Tax reminders", text: "Settled debts are flagged so forgiven amounts are not a surprise at filing time. Each one has room for what your tax professional said." },
  { title: "Several people and companies", text: "Keep personal and business debts together or apart, see which guarantees reach you, and export everything to a spreadsheet." },
];

export default async function Landing() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const steps = balanceSteps(EXAMPLE);
  const points = steps.map((s, i) => ({ label: i === 0 ? "Start" : `#${i}`, value: s.balanceCents }));
  const last = steps[steps.length - 1].balanceCents;

  return (
    <div className="lp">
      <header className="lp-top">
        <span className="lp-brand">The Debt Playbook</span>
        <Link className="btn ghost small" href="/login">Sign in</Link>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-eyebrow">Private beta</p>
          <h1>Every debt, every offer and every payment in one place.</h1>
          <p className="lp-lede">
            A tracker for people dealing with large, mixed debt: back taxes, business loans, credit cards and secured loans. Follow each balance down, log every conversation with a creditor, and see what is due and when.
          </p>
          <div className="actions">
            <Link className="btn" href="/login">Sign in</Link>
            <a className="btn ghost" href="#features">See what it does</a>
          </div>
        </div>

        <figure className="lp-example panel" aria-label="Example settlement">
          <figcaption>
            <span className="chip c-kept">Example data</span>
            <b>Business loan settled at $50,000</b>
            <span className="note">Original balance $155,000, paid over 36 monthly payments. Shown after 12.</span>
          </figcaption>
          <Chart points={points} step aria="Example balance after each of 12 payments, falling from $50,000 to $33,333" />
          <dl className="lp-facts">
            <div><dt>Original</dt><dd className="num">{usdWhole(15_500_000)}</dd></div>
            <div><dt>Eliminated</dt><dd className="num" style={{ color: "var(--good)" }}>{usdWhole(10_500_000)}</dd></div>
            <div><dt>Paid so far</dt><dd className="num">{usdWhole(5_000_000 - last)}</dd></div>
            <div><dt>Still owed</dt><dd className="num">{usdWhole(last)}</dd></div>
          </dl>
        </figure>
      </section>

      <section className="lp-section lp-split">
        <h2 className="lp-h2">Made for debt that payoff apps leave out</h2>
        <div className="lp-prose">
          <p>
            Most debt tools assume you can make every minimum payment and want to know which card to pay first. They have little to say about a tax bill, a business loan in default, or a settlement you agreed to over three years.
          </p>
          <p>
            The Debt Playbook keeps all of it in one view. A settled balance is the amount you agreed to pay, not an interest schedule. A debt with a personal guarantee shows up where it reaches you. A conversation with a creditor is logged next to the debt, with the dates that matter.
          </p>
        </div>
      </section>

      <section className="lp-section" id="features">
        <h2 className="lp-h2">What it does</h2>
        <ul className="lp-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">Follow each negotiation from start to close</h2>
        <ol className="lp-stages">
          {STAGE_ORDER.map((s) => <li key={s}>{STAGE_LABEL[s]}</li>)}
        </ol>
        <p className="note">Move a debt along as things change. Each stage keeps its own dates, offers and notes.</p>
      </section>

      <section className="lp-section lp-split">
        <h2 className="lp-h2">What it is and is not</h2>
        <div className="lp-prose">
          <p>
            It is a record-keeping tool. It does not negotiate for you, it is not a debt relief, credit counseling or legal service, and it gives no legal, tax or financial advice. It cannot promise any result, and the examples here are illustrations.
          </p>
          <p>
            Each account sees only its own data, and the database enforces that, not just the app. You can export your debts, payments and settlements to a spreadsheet at any time.
          </p>
          <p className="note">
            Built by Francis Nzeutem, who has managed more than $600,000 of mixed debt across back taxes, a business loan, credit cards and secured loans. This is the tool he wanted while doing it.
          </p>
        </div>
      </section>

      <section className="lp-cta panel">
        <div>
          <h2 className="lp-h2" style={{ margin: 0 }}>Private beta</h2>
          <p className="note" style={{ margin: "4px 0 0" }}>Sign in to your account to start tracking.</p>
        </div>
        <Link className="btn" href="/login">Sign in</Link>
      </section>

      <footer className="lp-foot">
        <p>
          The Debt Playbook is a record-keeping tool. It is not a debt relief, credit counseling or legal service and does not provide legal, tax or financial advice. Examples are illustrative and do not predict your results. Talk to a licensed professional about your situation.
        </p>
        <p>&copy; 2026 The Debt Playbook</p>
      </footer>
    </div>
  );
}
