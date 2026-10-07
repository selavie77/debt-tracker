import type { Db } from "./db";
import { contacts, debts, entities, income, negotiations, offers, payments, settlements, type DebtStatus, type DebtType } from "./db/schema";
import { addMonths } from "./dates";

const c = (dollars: number) => Math.round(dollars * 100);

/**
 * Example negotiations, offers, contacts and income for the example debts (found by name).
 * Returns false when there is nothing to add, so it is safe to offer as a button on an existing account.
 */
export async function seedNegotiationExamples(db: Db): Promise<boolean> {
  const [existing] = await db.select({ id: negotiations.id }).from(negotiations).limit(1);
  if (existing) return false;
  const rows = await db.select({ id: debts.id, name: debts.name }).from(debts);
  const id = (name: string) => rows.find((r) => r.name === name)?.id;
  const hbj = id("HBJ Financial business loan"), win = id("Window replacement loan"), amex = id("American Express business card");
  if (!hbj && !win && !amex) return false;

  if (hbj) {
    await db.insert(negotiations).values({ debtId: hbj, stage: "paying", stageChangedOn: "2026-01-15", silenceStartedOn: "2025-03-01", silenceDays: 180 });
    await db.insert(offers).values([
      { debtId: hbj, madeOn: "2025-09-20", party: "us", amountCents: c(50000), installments: 36, note: "Opening offer, about 32% of the balance" },
      { debtId: hbj, madeOn: "2025-12-18", party: "creditor", amountCents: c(75000), installments: 36, note: "Settlement committee counter" },
      { debtId: hbj, madeOn: "2025-12-20", party: "us", amountCents: c(50000), installments: 36, note: "Held at original offer. Accepted." },
    ]);
    await db.insert(contacts).values([
      { debtId: hbj, contactedOn: "2025-09-12", channel: "letter", direction: "in", summary: "Letter from the creditor's law firm. Did not reply to the firm." },
      { debtId: hbj, contactedOn: "2025-09-15", channel: "phone", direction: "out", summary: "Called the creditor directly. Collections confirmed they prefer to settle directly and moved me to the settlement team." },
      { debtId: hbj, contactedOn: "2025-12-20", channel: "phone", direction: "out", summary: "Held at $50,000 over 36 months. Rep to confirm in writing." },
    ]);
  }
  if (win) {
    await db.insert(negotiations).values({ debtId: win, stage: "silence", stageChangedOn: "2026-08-06", silenceStartedOn: "2026-08-06", silenceDays: 92, nextActionOn: "2026-11-06", nextActionNote: "Decide on an offer when silence ends" });
    await db.insert(contacts).values({ debtId: win, contactedOn: "2026-09-02", channel: "email", direction: "in", summary: "Past-due notice received. No reply sent." });
  }
  if (amex) {
    await db.insert(negotiations).values({ debtId: amex, stage: "counter_offer", stageChangedOn: "2026-10-02", silenceStartedOn: "2026-06-05", silenceDays: 90, nextActionOn: "2026-10-16", nextActionNote: "Respond to the counter-offer" });
    await db.insert(offers).values([
      { debtId: amex, madeOn: "2026-09-18", party: "us", amountCents: c(4000), installments: 1, note: "Lump-sum offer" },
      { debtId: amex, madeOn: "2026-10-02", party: "creditor", amountCents: c(6500), installments: 1, expiresOn: "2026-10-30", note: "Rep says it expires Oct 30" },
    ]);
    await db.insert(contacts).values([
      { debtId: amex, contactedOn: "2026-09-18", channel: "email", direction: "out", summary: "Sent the $4,000 lump-sum offer." },
      { debtId: amex, contactedOn: "2026-10-02", channel: "phone", direction: "in", summary: "Counter-offer of $6,500, valid until Oct 30." },
    ]);
  }
  const [anyIncome] = await db.select({ id: income.id }).from(income).limit(1);
  if (!anyIncome) {
    await db.insert(income).values([
      { name: "Salary", amountCents: c(2100), dayOfMonth: 1, isExample: true },
      { name: "Salary", amountCents: c(2100), dayOfMonth: 16, isExample: true },
    ]);
  }
  return true;
}

/** Insert example data modeled on the book for the signed-in user. Safe to call once; callers check for an empty account. */
export async function seedExample(db: Db) {
  const [me, biz] = await db
    .insert(entities)
    .values([
      { name: "Francis (personal)", kind: "person", isExample: true },
      { name: "Operating Co. LLC", kind: "business", isExample: true },
    ])
    .returning({ id: entities.id });

  const mk = (
    entityId: string,
    name: string,
    creditor: string,
    type: DebtType,
    original: number,
    extra: Partial<typeof debts.$inferInsert> = {},
  ) => ({ entityId, name, creditor, type, originalCents: c(original), isExample: true, ...extra });

  const rows = [
    mk(biz.id, "IRS federal tax", "Internal Revenue Service", "federal_tax", 120000, { government: true, status: "paid" as DebtStatus }),
    mk(biz.id, "New York State tax", "NYS Dept. of Taxation", "state_tax", 30000, { government: true, status: "paid" }),
    mk(biz.id, "HBJ Financial business loan", "HBJ Financial", "business_loan", 155000, { rateBps: 1700, personalGuarantee: true, status: "settled" }),
    mk(me.id, "Credit cards (5 accounts)", "Multiple issuers", "credit_card", 100000, { rateBps: 2200, status: "settled" }),
    mk(biz.id, "SBA EIDL loan", "U.S. Small Business Administration", "government_loan", 150000, { rateBps: 375, government: true, personalGuarantee: true, status: "kept", monthlyPaymentCents: c(750), paymentDay: 20, collateral: "Business assets (blanket lien)" }),
    mk(me.id, "Solar panel loan", "Solar lender", "secured", 28000, { rateBps: 899, monthlyPaymentCents: c(167), paymentDay: 8, collateral: "Solar panels on home" }),
    mk(me.id, "Window replacement loan", "Window contractor financing", "secured", 21000, { rateBps: 999, status: "negotiating", delinquentSince: "2026-08-06", collateral: "Installed windows" }),
    mk(biz.id, "American Express business card", "American Express", "credit_card", 12000, { rateBps: 2499, personalGuarantee: true, status: "negotiating", delinquentSince: "2026-06-05" }),
  ];
  const ids = await db.insert(debts).values(rows).returning({ id: debts.id });
  const [irs, nys, hbj, cards, , solar] = ids.map((r) => r.id);

  await db.insert(settlements).values([
    { debtId: irs, agreedCents: c(25000), installmentCents: c(25000), installments: 1, agreedOn: "2025-11-18", firstPaymentOn: "2025-12-05" },
    { debtId: nys, agreedCents: c(5000), installmentCents: c(5000), installments: 1, agreedOn: "2025-09-22", firstPaymentOn: "2025-10-14" },
    { debtId: hbj, agreedCents: c(50000), installmentCents: 138889, installments: 36, agreedOn: "2025-12-20", firstPaymentOn: "2026-01-15" },
    { debtId: cards, agreedCents: c(20000), installmentCents: c(1000), installments: 20, agreedOn: "2025-11-01", firstPaymentOn: "2025-11-01" },
  ]);

  const pay = (debtId: string, start: string, n: number, amount: number) =>
    Array.from({ length: n }, (_, i) => ({ debtId, paidOn: addMonths(start, i), amountCents: amount }));
  await db.insert(payments).values([
    ...pay(irs, "2025-12-05", 1, c(25000)),
    ...pay(nys, "2025-10-14", 1, c(5000)),
    ...pay(hbj, "2026-01-15", 9, 138889),
    ...pay(cards, "2025-11-01", 12, c(1000)),
    ...pay(solar, "2026-01-08", 9, c(167)),
  ]);
  await seedNegotiationExamples(db);
}
