"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCsv, toRecords } from "@/lib/csv";
import { withUser, type Db } from "@/lib/db";
import { DEBT_STATUSES, DEBT_TYPES, debts, entities, payments, settlements } from "@/lib/db/schema";
import { isISODate, todayISO } from "@/lib/dates";
import { balanceAt } from "@/lib/finance";
import { toCents } from "@/lib/money";
import { getDebt } from "@/lib/queries";
import { seedExample, seedNegotiationExamples } from "@/lib/seed";

export type FormState = { error?: string; ok?: string } | undefined;

const money = z.string().transform((v, ctx) => {
  const c = toCents(v);
  if (!Number.isFinite(c)) {
    ctx.addIssue({ code: "custom", message: "Enter a dollar amount like 1,388.50" });
    return z.NEVER;
  }
  return c;
});
const date = z.string().refine(isISODate, "Enter a valid date");
const optDate = z.string().transform((v) => (v === "" ? null : v)).refine((v) => v === null || isISODate(v), "Enter a valid date");
const optMoney = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const c = toCents(v);
  if (!Number.isFinite(c)) {
    ctx.addIssue({ code: "custom", message: "Enter a dollar amount" });
    return z.NEVER;
  }
  return c;
});
const optPercent = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const n = Number(v.replace("%", ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    ctx.addIssue({ code: "custom", message: "Enter a rate between 0 and 100" });
    return z.NEVER;
  }
  return Math.round(n * 100);
});

function fail(e: z.ZodError): FormState {
  return { error: e.issues.map((i) => i.message).join(". ") };
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

export async function addEntity(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ name: z.string().min(1, "Enter a name"), kind: z.enum(["person", "business"]) }).safeParse({ name: str(fd, "name"), kind: str(fd, "kind") });
  if (!p.success) return fail(p.error);
  await withUser((db) => db.insert(entities).values(p.data));
  refresh();
  return { ok: `Added ${p.data.name}` };
}

export async function loadExampleData() {
  await withUser(async (db) => {
    const [{ n }] = await db.select({ n: count() }).from(entities);
    if (n === 0) await seedExample(db);
  });
  refresh();
}

export async function loadNegotiationExamples() {
  await withUser((db) => seedNegotiationExamples(db));
  refresh();
}

const debtSchema = z.object({
  entityId: z.string().min(1, "Choose who owes this debt"),
  name: z.string().min(1, "Enter a name for the debt"),
  creditor: z.string(),
  type: z.enum(DEBT_TYPES),
  originalCents: money.refine((c) => c > 0, "Original balance must be more than zero"),
  rateBps: optPercent,
  collateral: z.string(),
  government: z.boolean(),
  personalGuarantee: z.boolean(),
  status: z.enum(DEBT_STATUSES),
  delinquentSince: optDate,
  monthlyPaymentCents: optMoney,
  paymentDay: z.string().transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 28), "Payment day must be 1 to 28"),
  notes: z.string(),
});

function debtInput(fd: FormData) {
  return debtSchema.safeParse({
    entityId: str(fd, "entityId"),
    name: str(fd, "name"),
    creditor: str(fd, "creditor"),
    type: str(fd, "type"),
    originalCents: str(fd, "original"),
    rateBps: str(fd, "rate"),
    collateral: str(fd, "collateral"),
    government: fd.get("government") === "on",
    personalGuarantee: fd.get("personalGuarantee") === "on",
    status: str(fd, "status"),
    delinquentSince: str(fd, "delinquentSince"),
    monthlyPaymentCents: str(fd, "monthly"),
    paymentDay: str(fd, "paymentDay"),
    notes: str(fd, "notes"),
  });
}

export async function createDebt(_: FormState, fd: FormData): Promise<FormState> {
  const p = debtInput(fd);
  if (!p.success) return fail(p.error);
  const row = await withUser(async (db) => (await db.insert(debts).values(p.data).returning({ id: debts.id }))[0]);
  refresh();
  redirect(`/debts/${row.id}`);
}

export async function updateDebt(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = debtInput(fd);
  if (!p.success) return fail(p.error);
  await withUser((db) => db.update(debts).set(p.data).where(eq(debts.id, id)));
  refresh();
  return { ok: "Saved" };
}

export async function deleteDebt(id: string) {
  await withUser((db) => db.delete(debts).where(eq(debts.id, id)));
  refresh();
  redirect("/debts");
}

/** After any change, move a fully paid debt to Paid, or back to its working status. */
async function syncStatus(db: Db, id: string) {
  const full = await getDebt(db, id);
  if (!full) return;
  const owed = balanceAt(full, todayISO());
  if (owed <= 0 && full.debt.status !== "kept" && (full.payments.length > 0 || full.settlement)) {
    await db.update(debts).set({ status: "paid" }).where(eq(debts.id, id));
  } else if (full.debt.status === "paid" && owed > 0) {
    await db.update(debts).set({ status: full.settlement ? "settled" : "active" }).where(eq(debts.id, id));
  }
}

export async function addPayment(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = z
    .object({
      amountCents: money.refine((c) => c > 0, "Payment must be more than zero"),
      interestCents: optMoney,
      paidOn: date,
      note: z.string(),
    })
    .safeParse({ amountCents: str(fd, "amount"), interestCents: str(fd, "interest"), paidOn: str(fd, "paidOn"), note: str(fd, "note") });
  if (!p.success) return fail(p.error);
  const interest = p.data.interestCents ?? 0;
  if (interest > p.data.amountCents) return { error: "Interest cannot be more than the payment" };
  await withUser(async (db) => {
    await db.insert(payments).values({ debtId, paidOn: p.data.paidOn, amountCents: p.data.amountCents, interestCents: interest, note: p.data.note });
    await syncStatus(db, debtId);
  });
  refresh();
  return { ok: "Payment logged" };
}

export async function deletePayment(debtId: string, paymentId: string) {
  await withUser(async (db) => {
    await db.delete(payments).where(eq(payments.id, paymentId));
    await syncStatus(db, debtId);
  });
  refresh();
}

export async function saveSettlement(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = z
    .object({
      agreedCents: money.refine((c) => c > 0, "Agreed amount must be more than zero"),
      installments: z.coerce.number().int().min(1, "Use at least 1 payment").max(600),
      agreedOn: date,
      firstPaymentOn: date,
      notes: z.string(),
    })
    .safeParse({ agreedCents: str(fd, "agreed"), installments: str(fd, "installments"), agreedOn: str(fd, "agreedOn"), firstPaymentOn: str(fd, "firstPaymentOn"), notes: str(fd, "notes") });
  if (!p.success) return fail(p.error);
  const result = await withUser(async (db): Promise<FormState> => {
    const full = await getDebt(db, debtId);
    if (!full) return { error: "Debt not found" };
    if (p.data.agreedCents > full.debt.originalCents) return { error: "Agreed amount is higher than the original balance" };
    const installmentCents = Math.round(p.data.agreedCents / p.data.installments);
    const values = { debtId, ...p.data, installmentCents };
    await db.insert(settlements).values(values).onConflictDoUpdate({ target: settlements.debtId, set: values });
    if (full.debt.status !== "paid") await db.update(debts).set({ status: "settled" }).where(eq(debts.id, debtId));
    await syncStatus(db, debtId);
    return { ok: "Settlement saved" };
  });
  refresh();
  return result;
}

const TYPE_ALIASES: Record<string, (typeof DEBT_TYPES)[number]> = {
  "federal tax": "federal_tax", "state tax": "state_tax", "business loan": "business_loan",
  "government loan": "government_loan", "credit card": "credit_card", secured: "secured", "personal loan": "personal_loan",
};
const yes = (v: string | undefined) => /^(y|yes|true|1|x)$/i.test((v ?? "").trim());

/** Import debts or payments from pasted CSV. The whole file is validated before anything is written. */
export async function importCsv(_: FormState, fd: FormData): Promise<FormState> {
  const kind = str(fd, "kind");
  const recs = toRecords(parseCsv(String(fd.get("csv") ?? "")));
  if (recs.length === 0) return { error: "Paste a header row and at least one data row" };

  const result = await withUser(async (db): Promise<FormState> => {
    const existingEntities = await db.select().from(entities);
    const existingDebts = await db.select().from(debts);

    if (kind === "payments") {
      const rows: (typeof payments.$inferInsert)[] = [];
      for (const [i, r] of recs.entries()) {
        const debt = existingDebts.find((d) => d.name.toLowerCase() === (r.debt ?? "").toLowerCase());
        const amount = toCents(r.amount ?? "");
        const interest = r.interest ? toCents(r.interest) : 0;
        if (!debt) return { error: `Row ${i + 2}: no debt named "${r.debt}". Add the debt first` };
        if (!isISODate(r.date ?? "")) return { error: `Row ${i + 2}: date must look like 2026-01-15` };
        if (!(amount > 0)) return { error: `Row ${i + 2}: amount must be more than zero` };
        if (!Number.isFinite(interest) || interest > amount) return { error: `Row ${i + 2}: interest is not valid` };
        rows.push({ debtId: debt.id, paidOn: r.date, amountCents: amount, interestCents: interest, note: r.note ?? "" });
      }
      await db.insert(payments).values(rows);
      for (const id of new Set(rows.map((r) => r.debtId))) await syncStatus(db, id);
      return { ok: `Imported ${rows.length} payments` };
    }

    const entityByName = new Map(existingEntities.map((e) => [e.name.toLowerCase(), e.id]));
    const toCreate: { name: string; kind: "person" | "business" }[] = [];
    const pending: { entityName: string; row: Omit<typeof debts.$inferInsert, "entityId"> }[] = [];
    for (const [i, r] of recs.entries()) {
      const original = toCents(r.original ?? "");
      if (!r.name) return { error: `Row ${i + 2}: name is missing` };
      if (!(original > 0)) return { error: `Row ${i + 2}: original balance must be more than zero` };
      const eName = (r.entity ?? "").trim();
      if (!eName) return { error: `Row ${i + 2}: entity is missing` };
      if (!entityByName.has(eName.toLowerCase()) && !toCreate.some((e) => e.name.toLowerCase() === eName.toLowerCase())) {
        toCreate.push({ name: eName, kind: /llc|inc|corp|co\b|company/i.test(eName) ? "business" : "person" });
      }
      const rate = r.rate ? Number(r.rate.replace("%", "")) : null;
      pending.push({
        entityName: eName,
        row: {
          name: r.name, creditor: r.creditor ?? "",
          type: TYPE_ALIASES[(r.type ?? "").toLowerCase()] ?? (DEBT_TYPES.find((t) => t === r.type) ?? "other"),
          originalCents: original, rateBps: rate != null && Number.isFinite(rate) ? Math.round(rate * 100) : null,
          status: DEBT_STATUSES.find((s) => s === (r.status ?? "").toLowerCase()) ?? "active",
          monthlyPaymentCents: r.monthly ? toCents(r.monthly) : null,
          paymentDay: r.payment_day ? Number(r.payment_day) : null,
          collateral: r.collateral ?? "", government: yes(r.government), personalGuarantee: yes(r.personal_guarantee),
        },
      });
    }
    if (toCreate.length) {
      const made = await db.insert(entities).values(toCreate).returning();
      made.forEach((e) => entityByName.set(e.name.toLowerCase(), e.id));
    }
    await db.insert(debts).values(pending.map((p) => ({ ...p.row, entityId: entityByName.get(p.entityName.toLowerCase())! })));
    return { ok: `Imported ${pending.length} debts${toCreate.length ? ` and ${toCreate.length} new entities` : ""}` };
  });
  refresh();
  return result;
}

export async function removeSettlement(debtId: string) {
  await withUser(async (db) => {
    await db.delete(settlements).where(eq(settlements.debtId, debtId));
    await db.update(debts).set({ status: "active" }).where(eq(debts.id, debtId));
    await syncStatus(db, debtId);
  });
  refresh();
}
