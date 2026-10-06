import { describe, expect, it } from "vitest";
import { buildReminders, isTimeSensitive, pickNew, reminderBucket, reminderKey, type Reminder } from "./negotiation";
import { buildDigest } from "./reminder-email";

describe("reminder countdown steps", () => {
  it("buckets the days left", () => {
    const b = (due: string) => reminderBucket(due, "2026-10-10");
    expect([b("2026-10-24"), b("2026-10-17"), b("2026-10-13"), b("2026-10-11"), b("2026-10-10"), b("2026-10-09")]).toEqual(["14", "7", "3", "1", "0", "over"]);
    expect(reminderBucket(null, "2026-10-10")).toBe("-");
  });
  it("only lateness is not time-sensitive", () => {
    expect(isTimeSensitive({ kind: "late" })).toBe(false);
    expect(isTimeSensitive({ kind: "offer_expiry" })).toBe(true);
  });
  it("changes the key when the countdown step or due date changes, not on other days", () => {
    const r = { debtId: "a", kind: "offer_expiry", dueOn: "2026-10-30" } as const;
    expect(reminderKey(r, "2026-10-24")).toBe(reminderKey(r, "2026-10-25")); // both 6 and 5 days left: step "7"
    expect(reminderKey(r, "2026-10-25")).not.toBe(reminderKey(r, "2026-10-28")); // 2 days left: step "3"
    expect(reminderKey(r, "2026-10-25")).not.toBe(reminderKey({ ...r, dueOn: "2026-11-05" }, "2026-10-25"));
  });
});

const debts = [
  { id: "a", name: "Amex <b>card</b>", status: "negotiating", owedCents: 1_200_000, delinquentSince: "2026-06-05" },
  { id: "w", name: "Windows", status: "negotiating", owedCents: 2_100_000, delinquentSince: "2026-08-06" },
];
const negs = [{ debtId: "a", stage: "counter_offer" as const, silenceStartedOn: null, silenceDays: null, nextActionOn: "2026-10-16", nextActionNote: "Respond" }];
const offers = [{ debtId: "a", party: "creditor" as const, madeOn: "2026-10-02", expiresOn: "2026-10-30", amountCents: 650_000 }];

describe("choosing what to email", () => {
  it("does not email for lateness alone", () => {
    const r = buildReminders(debts, [], [], "2026-10-05");
    expect(r.length).toBeGreaterThan(0);
    expect(pickNew(r, new Set(), "2026-10-05")).toEqual([]);
  });
  it("emails new time-sensitive items once per step", () => {
    const today = "2026-10-12"; // next action is 4 days away
    const r = buildReminders(debts, negs, offers, today);
    const fresh = pickNew(r, new Set(), today);
    expect(fresh.map((x) => x.kind)).toEqual(["action"]);
    const sent = new Set(fresh.map((x) => reminderKey(x, today)));
    // Other days in the same step (4 to 7 days left) stay quiet.
    for (const day of ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]) {
      expect(pickNew(buildReminders(debts, negs, offers, day), sent, day)).toEqual([]);
    }
  });
  it("emails again at the next countdown step", () => {
    const sent = new Set(pickNew(buildReminders(debts, negs, offers, "2026-10-12"), new Set(), "2026-10-12").map((x) => reminderKey(x, "2026-10-12")));
    for (const day of ["2026-10-13", "2026-10-15", "2026-10-16", "2026-10-17"]) {
      // 3 days, 1 day, due today, overdue: each is a new step
      const again = pickNew(buildReminders(debts, negs, offers, day), sent, day).filter((x) => x.kind === "action");
      expect(again).toHaveLength(1);
    }
  });
});

describe("digest email", () => {
  const today = "2026-10-26";
  const reminders: Reminder[] = buildReminders(debts, negs, offers, today);
  it("lists urgent items first and late items under their own heading", () => {
    const d = buildDigest(reminders);
    expect(d.count).toBe(2);
    expect(d.subject).toMatch(/2 items need attention/);
    expect(d.text).toMatch(/Also late:/);
    expect(d.text).toMatch(/dashboard/);
    expect(d.text).toMatch(/not legal, tax or financial advice/);
  });
  it("escapes debt names in the HTML", () => {
    const d = buildDigest(reminders);
    expect(d.html).toContain("Amex &lt;b&gt;card&lt;/b&gt;");
    expect(d.html).not.toContain("<b>card</b>");
  });
  it("leaves balances out", () => {
    const d = buildDigest(reminders);
    expect(d.text + d.html).not.toMatch(/\$[\d,]{4,}/);
  });
  it("makes a clear test email when nothing needs attention", () => {
    const d = buildDigest([], { test: true });
    expect(d.subject).toMatch(/test email/);
    expect(d.text).toMatch(/Nothing needs attention/);
  });
  it("uses the single item as the subject", () => {
    const one = buildReminders(debts, negs, [], "2026-10-12");
    expect(buildDigest(one).subject).toMatch(/Amex/);
  });
});
