import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  contacts, debts, entities, expenses, income, negotiations, offers, payments, settlements, taxItems,
  type Debt, type Entity, type Expense, type Income, type Negotiation, type Offer, type Payment, type Settlement, type TaxItem,
} from "./db/schema";
import { balanceAt, eliminated, totalPaid, type DebtBundle } from "./finance";
import { todayISO } from "./dates";

// These take the user-scoped `db` from withUser(), so row-level security applies to every read.

export type DebtFull = DebtBundle & {
  debt: Debt;
  settlement: Settlement | null;
  payments: Payment[];
  entity: Entity;
  owed: number;
  eliminated: number;
  paid: number;
  target: number; // what has to be paid in total: agreed amount, else original
};

function build(entity: Entity, debt: Debt, settlement: Settlement | null, pays: Payment[]): DebtFull {
  const sorted = [...pays].sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1));
  const bundle: DebtBundle = { debt, settlement, payments: sorted };
  const today = todayISO();
  return {
    ...bundle,
    debt,
    settlement,
    payments: sorted,
    entity,
    owed: balanceAt(bundle, today),
    eliminated: eliminated(bundle),
    paid: totalPaid(bundle),
    target: settlement ? settlement.agreedCents : debt.originalCents,
  };
}

export async function listEntities(db: Db): Promise<Entity[]> {
  return db.select().from(entities).orderBy(asc(entities.createdAt));
}

export async function listDebts(db: Db): Promise<DebtFull[]> {
  const [es, ds, ss, ps] = await Promise.all([
    db.select().from(entities),
    db.select().from(debts).orderBy(asc(debts.createdAt)),
    db.select().from(settlements),
    db.select().from(payments),
  ]);
  return ds.map((d) =>
    build(
      es.find((e) => e.id === d.entityId)!,
      d,
      ss.find((s) => s.debtId === d.id) ?? null,
      ps.filter((p) => p.debtId === d.id),
    ),
  );
}

export async function listNegotiations(db: Db): Promise<Negotiation[]> {
  return db.select().from(negotiations).orderBy(asc(negotiations.createdAt));
}

export async function listOffers(db: Db): Promise<Offer[]> {
  return db.select().from(offers).orderBy(asc(offers.madeOn));
}

export async function listIncome(db: Db): Promise<Income[]> {
  return db.select().from(income).orderBy(asc(income.dayOfMonth));
}

export async function listExpenses(db: Db): Promise<Expense[]> {
  return db.select().from(expenses).orderBy(asc(expenses.createdAt));
}

export async function listTaxItems(db: Db): Promise<TaxItem[]> {
  return db.select().from(taxItems);
}

export async function getNegotiationBundle(db: Db, debtId: string) {
  const [[negotiation], offerRows, contactRows] = await Promise.all([
    db.select().from(negotiations).where(eq(negotiations.debtId, debtId)),
    db.select().from(offers).where(eq(offers.debtId, debtId)).orderBy(desc(offers.madeOn), desc(offers.createdAt)),
    db.select().from(contacts).where(eq(contacts.debtId, debtId)).orderBy(desc(contacts.contactedOn), desc(contacts.createdAt)),
  ]);
  return { negotiation: negotiation ?? null, offers: offerRows, contacts: contactRows };
}

export async function getDebt(db: Db, id: string): Promise<DebtFull | null> {
  const [d] = await db.select().from(debts).where(eq(debts.id, id));
  if (!d) return null;
  const [[e], [s], ps] = await Promise.all([
    db.select().from(entities).where(eq(entities.id, d.entityId)),
    db.select().from(settlements).where(eq(settlements.debtId, id)),
    db.select().from(payments).where(eq(payments.debtId, id)),
  ]);
  return build(e, d, s ?? null, ps);
}
