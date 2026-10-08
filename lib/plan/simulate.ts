import { addMonths } from "../dates";

// Payoff simulation. Pure functions, no database, so it also runs in the browser for the what-if tool.

export type SimDebt = {
  id: string;
  name: string;
  balanceCents: number;
  aprBps: number; // 1700 = 17%
  minPaymentCents: number;
  /** A settled debt: fixed installments, no interest, and extra money cannot speed it up. */
  fixed?: boolean;
};

export type Strategy = "avalanche" | "snowball";

export type SimDebtResult = { id: string; name: string; payoffMonth: number | null; interestCents: number };

export type SimResult = {
  months: number; // months until everything is paid, or the cap
  capped: boolean; // true when something was still unpaid at the cap
  totalInterestCents: number;
  totalPaidCents: number;
  perDebt: SimDebtResult[];
  stuck: string[]; // debts whose payment never covers the interest
};

const MAX_MONTHS = 600;

/**
 * Month by month: interest accrues, each debt gets its minimum, and the extra money plus the minimums
 * freed up by debts already paid off goes to one target debt at a time.
 * avalanche = highest rate first (least interest). snowball = smallest balance first (quick wins).
 */
export function simulate(debts: SimDebt[], opts: { extraCents: number; strategy: Strategy; maxMonths?: number }): SimResult {
  const cap = opts.maxMonths ?? MAX_MONTHS;
  const state = debts.map((d) => ({ ...d, bal: d.balanceCents, interest: 0, payoffMonth: null as number | null }));
  let totalInterest = 0;
  let totalPaid = 0;
  let freed = 0; // minimum payments of debts that are already finished
  let month = 0;

  const open = () => state.filter((d) => d.bal > 0);

  while (open().length > 0 && month < cap) {
    month++;
    let pool = opts.extraCents + freed;

    for (const d of open()) {
      const interest = d.fixed ? 0 : Math.round((d.bal * d.aprBps) / 10000 / 12);
      d.bal += interest;
      d.interest += interest;
      totalInterest += interest;
    }
    for (const d of open()) {
      const pay = Math.min(d.bal, d.minPaymentCents);
      d.bal -= pay;
      totalPaid += pay;
      pool += d.minPaymentCents - pay; // unused part of a final payment
      if (d.bal <= 0) {
        d.payoffMonth = month;
        freed += d.minPaymentCents; // from next month on, this payment is free for the rest
      }
    }
    // Extra money goes to one target at a time, in strategy order.
    const targets = open()
      .filter((d) => !d.fixed)
      .sort((a, b) => (opts.strategy === "avalanche" ? b.aprBps - a.aprBps || a.bal - b.bal : a.bal - b.bal || b.aprBps - a.aprBps));
    for (const d of targets) {
      if (pool <= 0) break;
      const pay = Math.min(d.bal, pool);
      d.bal -= pay;
      totalPaid += pay;
      pool -= pay;
      if (d.bal <= 0) {
        d.payoffMonth = month;
        freed += d.minPaymentCents;
      }
    }
  }

  const stuck = state
    .filter((d) => d.bal > 0 && !d.fixed && d.minPaymentCents <= Math.round((d.balanceCents * d.aprBps) / 10000 / 12))
    .map((d) => d.id);
  return {
    months: month,
    capped: open().length > 0,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    perDebt: state.map((d) => ({ id: d.id, name: d.name, payoffMonth: d.payoffMonth, interestCents: d.interest })),
    stuck,
  };
}

export function payoffDate(today: string, months: number): string {
  return addMonths(today, months);
}

export type Comparison = {
  baseline: SimResult;
  withExtra: SimResult;
  monthsSaved: number;
  interestSavedCents: number;
};

/** What the extra monthly amount changes compared with paying only the minimums. */
export function compareExtra(debts: SimDebt[], extraCents: number, strategy: Strategy): Comparison {
  const baseline = simulate(debts, { extraCents: 0, strategy });
  const withExtra = simulate(debts, { extraCents, strategy });
  return {
    baseline,
    withExtra,
    monthsSaved: Math.max(0, baseline.months - withExtra.months),
    interestSavedCents: Math.max(0, baseline.totalInterestCents - withExtra.totalInterestCents),
  };
}

export type SettlementWhatIf = {
  offerCents: number;
  eliminatedCents: number; // balance minus the offer, never below zero
  percentOfBalance: number; // offer as a percent of what is owed
  installmentCents: number;
  installments: number;
};

/** The numbers for an offer. It makes no claim about whether a creditor would accept it. */
export function settlementWhatIf(owedCents: number, offerCents: number, installments: number): SettlementWhatIf {
  const n = Math.max(1, Math.round(installments));
  return {
    offerCents,
    eliminatedCents: Math.max(0, owedCents - offerCents),
    percentOfBalance: owedCents > 0 ? Math.round((offerCents / owedCents) * 100) : 0,
    installmentCents: Math.round(offerCents / n),
    installments: n,
  };
}
