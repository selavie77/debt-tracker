import { addDays, daysBetween, fmtDate } from "./dates";
import type { Stage } from "./db/schema";

// Pure negotiation logic: stage labels, silence timer and the reminders shown on the dashboard.

export const STAGE_LABEL: Record<Stage, string> = {
  silence: "Silence period",
  lawyer_letter: "Lawyer letter",
  offer_sent: "Offer sent",
  counter_offer: "Counter-offer",
  accepted: "Accepted",
  paying: "Paying",
  closed: "Closed",
};

export const STAGE_ORDER: Stage[] = ["silence", "lawyer_letter", "offer_sent", "counter_offer", "accepted", "paying", "closed"];

export function nextStage(s: Stage): Stage | null {
  const i = STAGE_ORDER.indexOf(s);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export type NegotiationLike = {
  stage: Stage;
  silenceStartedOn: string | null;
  silenceDays: number | null;
  nextActionOn: string | null;
  nextActionNote: string;
};

/** Date the planned silence period ends, or null if no silence period is set. */
export function silenceEndsOn(n: Pick<NegotiationLike, "silenceStartedOn" | "silenceDays">): string | null {
  return n.silenceStartedOn && n.silenceDays ? addDays(n.silenceStartedOn, n.silenceDays) : null;
}

/** Days elapsed and remaining in the silence period. */
export function silenceProgress(n: Pick<NegotiationLike, "silenceStartedOn" | "silenceDays">, today: string) {
  if (!n.silenceStartedOn || !n.silenceDays) return null;
  const elapsed = Math.max(0, daysBetween(n.silenceStartedOn, today));
  return { elapsed, total: n.silenceDays, left: n.silenceDays - elapsed, endsOn: addDays(n.silenceStartedOn, n.silenceDays) };
}

export type Reminder = {
  level: "crit" | "warn" | "info";
  debtId: string;
  title: string;
  detail: string;
  sortKey: number; // lower is more urgent
};

export type ReminderDebt = { id: string; name: string; status: string; owedCents: number; delinquentSince: string | null };
export type ReminderOffer = { debtId: string; party: "us" | "creditor"; madeOn: string; expiresOn: string | null; amountCents: number };

const WINDOW_DAYS = 14;

export function buildReminders(
  debts: ReminderDebt[],
  negs: (NegotiationLike & { debtId: string })[],
  offers: ReminderOffer[],
  today: string,
): Reminder[] {
  const out: Reminder[] = [];
  const name = (id: string) => debts.find((d) => d.id === id)?.name ?? "Debt";

  for (const d of debts) {
    if (d.owedCents > 0 && d.delinquentSince && d.status !== "paid") {
      const days = daysBetween(d.delinquentSince, today);
      if (days > 0) {
        out.push({
          level: days >= 90 ? "crit" : "warn",
          debtId: d.id,
          title: `${d.name} is ${days} days late`,
          detail: `Late since ${fmtDate(d.delinquentSince)}.`,
          sortKey: days >= 90 ? 30 : 40,
        });
      }
    }
  }

  for (const n of negs) {
    if (n.stage === "silence") {
      const p = silenceProgress(n, today);
      if (p && p.left <= WINDOW_DAYS) {
        out.push(
          p.left < 0
            ? { level: "warn", debtId: n.debtId, title: `${name(n.debtId)}: silence period is over`, detail: `It ended ${fmtDate(p.endsOn)}. Decide the next step.`, sortKey: 10 }
            : { level: "info", debtId: n.debtId, title: `${name(n.debtId)}: silence period ends ${fmtDate(p.endsOn)}`, detail: p.left === 0 ? "Ends today." : `${p.left} days left of ${p.total}.`, sortKey: 20 + p.left },
        );
      }
    }
    if (n.nextActionOn) {
      const left = daysBetween(today, n.nextActionOn);
      if (left <= 7) {
        out.push({
          level: left < 0 ? "crit" : "warn",
          debtId: n.debtId,
          title: `${name(n.debtId)}: ${n.nextActionNote || "next action"}`,
          detail: left < 0 ? `Was due ${fmtDate(n.nextActionOn)} (${-left} days ago).` : left === 0 ? "Due today." : `Due ${fmtDate(n.nextActionOn)}.`,
          sortKey: left < 0 ? 0 : left,
        });
      }
    }
  }

  // Latest creditor offer per debt that has an expiry date.
  const latest = new Map<string, ReminderOffer>();
  for (const o of [...offers].sort((a, b) => (a.madeOn < b.madeOn ? -1 : 1))) latest.set(o.debtId, o);
  for (const o of latest.values()) {
    if (o.party !== "creditor" || !o.expiresOn) continue;
    const left = daysBetween(today, o.expiresOn);
    if (left <= WINDOW_DAYS && left >= -30) {
      out.push({
        level: left < 0 ? "crit" : left <= 3 ? "crit" : "warn",
        debtId: o.debtId,
        title: `${name(o.debtId)}: counter-offer ${left < 0 ? "expired" : "expires"} ${fmtDate(o.expiresOn)}`,
        detail: left < 0 ? "No reply logged since." : left === 0 ? "Expires today." : `${left} days left to respond.`,
        sortKey: left < 0 ? 1 : 2 + left,
      });
    }
  }

  const rank = { crit: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.sortKey - b.sortKey);
}
