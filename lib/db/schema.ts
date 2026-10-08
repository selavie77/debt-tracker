import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgPolicy, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

// Money is always stored as integer cents. Dates are ISO strings (YYYY-MM-DD).
// Every table carries owner_id and a row-level-security policy, so the database itself
// only ever returns the signed-in user's rows.

const pk = () => uuid("id").primaryKey().defaultRandom();
const owner = () =>
  uuid("owner_id")
    .notNull()
    .default(sql`auth.uid()`)
    .references(() => authUsers.id, { onDelete: "cascade" });
const created = () => timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();
const ownerOnly = (table: string, t: { ownerId: unknown }) =>
  pgPolicy(`${table}_owner_only`, {
    as: "permissive",
    for: "all",
    to: authenticatedRole,
    using: sql`${t.ownerId} = ${authUid}`,
    withCheck: sql`${t.ownerId} = ${authUid}`,
  });

export const DEBT_TYPES = [
  "federal_tax", // shown as "Federal back taxes"
  "state_tax", // shown as "State back taxes"
  "other_tax", // payroll, local, property and other back taxes
  "business_loan",
  "government_loan",
  "credit_card",
  "auto_loan",
  "mortgage",
  "secured",
  "student_loan",
  "personal_loan",
  "line_of_credit",
  "medical",
  "other",
] as const;
export type DebtType = (typeof DEBT_TYPES)[number];

export const DEBT_STATUSES = ["active", "negotiating", "settled", "paid", "kept"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const entities = pgTable(
  "entities",
  {
    id: pk(),
    ownerId: owner(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["person", "business"] }).notNull(),
    isExample: boolean("is_example").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("entities_owner_idx").on(t.ownerId), ownerOnly("entities", t)],
).enableRLS();

export const debts = pgTable(
  "debts",
  {
    id: pk(),
    ownerId: owner(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    creditor: text("creditor").notNull().default(""),
    type: text("type", { enum: DEBT_TYPES }).notNull().default("other"),
    originalCents: integer("original_cents").notNull(),
    rateBps: integer("rate_bps"), // 375 = 3.75%
    collateral: text("collateral").notNull().default(""),
    personalGuarantee: boolean("personal_guarantee").notNull().default(false),
    government: boolean("government").notNull().default(false),
    status: text("status", { enum: DEBT_STATUSES }).notNull().default("active"),
    delinquentSince: date("delinquent_since", { mode: "string" }),
    monthlyPaymentCents: integer("monthly_payment_cents"), // for non-settled debts
    paymentDay: integer("payment_day"), // 1-28
    notes: text("notes").notNull().default(""),
    isExample: boolean("is_example").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("debts_entity_idx").on(t.entityId), index("debts_owner_idx").on(t.ownerId), ownerOnly("debts", t)],
).enableRLS();

export const settlements = pgTable(
  "settlements",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .unique()
      .references(() => debts.id, { onDelete: "cascade" }),
    agreedCents: integer("agreed_cents").notNull(), // amount still to pay under the agreement
    installmentCents: integer("installment_cents").notNull(),
    installments: integer("installments").notNull(),
    agreedOn: date("agreed_on", { mode: "string" }).notNull(),
    firstPaymentOn: date("first_payment_on", { mode: "string" }).notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("settlements_owner_idx").on(t.ownerId), ownerOnly("settlements", t)],
).enableRLS();

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    interestCents: integer("interest_cents").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("payments_debt_idx").on(t.debtId, t.paidOn), index("payments_owner_idx").on(t.ownerId), ownerOnly("payments", t)],
).enableRLS();

// ---- Phase 2: negotiations, offers, contact log, income ----

export const STAGES = ["silence", "lawyer_letter", "offer_sent", "counter_offer", "accepted", "paying", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const CHANNELS = ["phone", "email", "letter", "portal", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const negotiations = pgTable(
  "negotiations",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .unique()
      .references(() => debts.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: STAGES }).notNull().default("silence"),
    stageChangedOn: date("stage_changed_on", { mode: "string" }).notNull(),
    silenceStartedOn: date("silence_started_on", { mode: "string" }),
    silenceDays: integer("silence_days"),
    nextActionOn: date("next_action_on", { mode: "string" }),
    nextActionNote: text("next_action_note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("negotiations_owner_idx").on(t.ownerId), ownerOnly("negotiations", t)],
).enableRLS();

export const offers = pgTable(
  "offers",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    madeOn: date("made_on", { mode: "string" }).notNull(),
    party: text("party", { enum: ["us", "creditor"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    installments: integer("installments"),
    expiresOn: date("expires_on", { mode: "string" }),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("offers_debt_idx").on(t.debtId, t.madeOn), index("offers_owner_idx").on(t.ownerId), ownerOnly("offers", t)],
).enableRLS();

export const contacts = pgTable(
  "contacts",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    contactedOn: date("contacted_on", { mode: "string" }).notNull(),
    channel: text("channel", { enum: CHANNELS }).notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    summary: text("summary").notNull(),
    createdAt: created(),
  },
  (t) => [index("contacts_debt_idx").on(t.debtId, t.contactedOn), index("contacts_owner_idx").on(t.ownerId), ownerOnly("contacts", t)],
).enableRLS();

export const income = pgTable(
  "income",
  {
    id: pk(),
    ownerId: owner(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dayOfMonth: integer("day_of_month").notNull(), // 1-30, or 31 for the last day of the month
    isExample: boolean("is_example").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("income_owner_idx").on(t.ownerId), ownerOnly("income", t)],
).enableRLS();

// ---- Phase 3: tax review tracking for settled debts ----

export const taxItems = pgTable(
  "tax_items",
  {
    id: pk(),
    ownerId: owner(),
    debtId: uuid("debt_id")
      .notNull()
      .unique()
      .references(() => debts.id, { onDelete: "cascade" }),
    formReceived: boolean("form_received").notNull().default(false), // e.g. a 1099-C from the creditor
    reviewedWithPro: boolean("reviewed_with_pro").notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("tax_items_owner_idx").on(t.ownerId), ownerOnly("tax_items", t)],
).enableRLS();

// ---- Phase 4: email reminders ----

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    id: pk(),
    ownerId: owner().unique(),
    emailReminders: boolean("email_reminders").notNull().default(false), // opt-in
    lastSentOn: date("last_sent_on", { mode: "string" }),
    lastTestAt: timestamp("last_test_at", { withTimezone: true, mode: "string" }),
    createdAt: created(),
  },
  (t) => [ownerOnly("notification_prefs", t)],
).enableRLS();

/** One row per reminder already emailed, so the same countdown step is never sent twice. */
export const reminderSent = pgTable(
  "reminder_sent",
  {
    id: pk(),
    ownerId: owner(),
    key: text("key").notNull(),
    sentOn: date("sent_on", { mode: "string" }).notNull(),
    createdAt: created(),
  },
  (t) => [unique("reminder_sent_owner_key").on(t.ownerId, t.key), ownerOnly("reminder_sent", t)],
).enableRLS();

// ---- Plan ----

export const planSettings = pgTable(
  "plan_settings",
  {
    id: pk(),
    ownerId: owner().unique(),
    livingCostsCents: integer("living_costs_cents"), // rent, food, utilities: what is needed before any debt payment
    createdAt: created(),
  },
  (t) => [ownerOnly("plan_settings", t)],
).enableRLS();

export type PlanSettings = typeof planSettings.$inferSelect;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type TaxItem = typeof taxItems.$inferSelect;
export type Negotiation = typeof negotiations.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Income = typeof income.$inferSelect;

export type Entity = typeof entities.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Payment = typeof payments.$inferSelect;
