"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { CHANNELS, STAGES, contacts, debts, income, negotiations, offers, taxItems } from "@/lib/db/schema";
import { isISODate, todayISO } from "@/lib/dates";
import { parseIncome } from "@/lib/income";
import { nextStage } from "@/lib/negotiation";
import { toCents } from "@/lib/money";
import type { FormState } from "./actions";

const refresh = () => revalidatePath("/", "layout");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const date = z.string().refine(isISODate, "Enter a valid date");
const optDate = z.string().transform((v) => (v === "" ? null : v)).refine((v) => v === null || isISODate(v), "Enter a valid date");
const cents = z.string().transform((v, ctx) => {
  const c = toCents(v);
  if (!Number.isFinite(c) || c <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter a dollar amount more than zero" });
    return z.NEVER;
  }
  return c;
});
const fail = (e: z.ZodError): FormState => ({ error: e.issues.map((i) => i.message).join(". ") });

export async function startNegotiation(debtId: string) {
  await withUser(async (db) => {
    const [d] = await db.select().from(debts).where(eq(debts.id, debtId));
    if (!d) return;
    const today = todayISO();
    await db
      .insert(negotiations)
      .values({ debtId, stage: "silence", stageChangedOn: today, silenceStartedOn: d.delinquentSince ?? today, silenceDays: 90 })
      .onConflictDoNothing({ target: negotiations.debtId });
    if (d.status === "active") await db.update(debts).set({ status: "negotiating" }).where(eq(debts.id, debtId));
  });
  refresh();
}

export async function stopNegotiation(debtId: string) {
  await withUser(async (db) => {
    await db.delete(negotiations).where(eq(negotiations.debtId, debtId));
    await db.update(debts).set({ status: "active" }).where(and(eq(debts.id, debtId), eq(debts.status, "negotiating")));
  });
  refresh();
}

export async function setStage(debtId: string, stage: (typeof STAGES)[number]) {
  if (!STAGES.includes(stage)) return;
  await withUser((db) => db.update(negotiations).set({ stage, stageChangedOn: todayISO() }).where(eq(negotiations.debtId, debtId)));
  refresh();
}

export async function advanceStage(debtId: string) {
  await withUser(async (db) => {
    const [n] = await db.select().from(negotiations).where(eq(negotiations.debtId, debtId));
    const next = n && nextStage(n.stage);
    if (next) await db.update(negotiations).set({ stage: next, stageChangedOn: todayISO() }).where(eq(negotiations.debtId, debtId));
  });
  refresh();
}

export async function updateNegotiation(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = z
    .object({
      stage: z.enum(STAGES),
      silenceStartedOn: optDate,
      silenceDays: z.string().transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 730), "Silence days must be 1 to 730"),
      nextActionOn: optDate,
      nextActionNote: z.string(),
    })
    .safeParse({
      stage: str(fd, "stage"),
      silenceStartedOn: str(fd, "silenceStartedOn"),
      silenceDays: str(fd, "silenceDays"),
      nextActionOn: str(fd, "nextActionOn"),
      nextActionNote: str(fd, "nextActionNote"),
    });
  if (!p.success) return fail(p.error);
  await withUser(async (db) => {
    const [cur] = await db.select().from(negotiations).where(eq(negotiations.debtId, debtId));
    const stageChangedOn = cur && cur.stage === p.data.stage ? cur.stageChangedOn : todayISO();
    await db.update(negotiations).set({ ...p.data, stageChangedOn }).where(eq(negotiations.debtId, debtId));
  });
  refresh();
  return { ok: "Saved" };
}

export async function addOffer(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = z
    .object({
      madeOn: date,
      party: z.enum(["us", "creditor"]),
      amountCents: cents,
      installments: z.string().transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 600), "Payments must be 1 to 600"),
      expiresOn: optDate,
      note: z.string(),
    })
    .safeParse({ madeOn: str(fd, "madeOn"), party: str(fd, "party"), amountCents: str(fd, "amount"), installments: str(fd, "installments"), expiresOn: str(fd, "expiresOn"), note: str(fd, "note") });
  if (!p.success) return fail(p.error);
  await withUser(async (db) => {
    await db.insert(offers).values({ debtId, ...p.data });
    // Log the stage the offer implies, unless the negotiation has already moved past it.
    const implied = p.data.party === "us" ? "offer_sent" : "counter_offer";
    const [n] = await db.select().from(negotiations).where(eq(negotiations.debtId, debtId));
    if (n && (n.stage === "silence" || n.stage === "lawyer_letter" || n.stage === "offer_sent" || n.stage === "counter_offer")) {
      if (n.stage !== implied) await db.update(negotiations).set({ stage: implied, stageChangedOn: todayISO() }).where(eq(negotiations.debtId, debtId));
    }
  });
  refresh();
  return { ok: "Offer logged" };
}

export async function deleteOffer(id: string) {
  await withUser((db) => db.delete(offers).where(eq(offers.id, id)));
  refresh();
}

export async function addContact(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = z
    .object({
      contactedOn: date,
      channel: z.enum(CHANNELS),
      direction: z.enum(["in", "out"]),
      summary: z.string().min(1, "Write a short summary of the contact"),
    })
    .safeParse({ contactedOn: str(fd, "contactedOn"), channel: str(fd, "channel"), direction: str(fd, "direction"), summary: str(fd, "summary") });
  if (!p.success) return fail(p.error);
  await withUser((db) => db.insert(contacts).values({ debtId, ...p.data }));
  refresh();
  return { ok: "Contact logged" };
}

export async function deleteContact(id: string) {
  await withUser((db) => db.delete(contacts).where(eq(contacts.id, id)));
  refresh();
}

export async function saveTaxItem(debtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const values = {
    debtId,
    formReceived: fd.get("formReceived") === "on",
    reviewedWithPro: fd.get("reviewedWithPro") === "on",
    note: str(fd, "note"),
  };
  await withUser((db) => db.insert(taxItems).values(values).onConflictDoUpdate({ target: taxItems.debtId, set: values }));
  refresh();
  return { ok: "Saved" };
}

/**
 * Adds one deposit per month, or two when the schedule is "twice a month" (one row per pay day, same amount).
 * Day 31 means the last day of the month.
 */
export async function addIncome(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseIncome({
    name: str(fd, "name"), amount: str(fd, "amount"), schedule: str(fd, "schedule"), day: str(fd, "day"), day2: str(fd, "day2"), kind: "steady",
  });
  if ("error" in parsed) return { error: parsed.error };
  await withUser((db) => db.insert(income).values(parsed.rows));
  refresh();
  revalidatePath("/plan");
  const name = parsed.rows[0].name;
  return { ok: parsed.rows.length === 2 ? `Added ${name} twice a month` : `Added ${name}` };
}

export async function deleteIncome(id: string) {
  await withUser((db) => db.delete(income).where(eq(income.id, id)));
  refresh();
}
