import { eq, like, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import { debts, entities, income, reminderSent } from "./db/schema";

// Example rows carry is_example = true. Clearing removes only those, and never an entity that
// still has a real debt.

export type ExampleSummary = {
  debts: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  incomeCount: number;
  total: number;
};

export async function exampleSummary(db: Db): Promise<ExampleSummary> {
  const [d, e, i] = await Promise.all([
    db.select({ id: debts.id, name: debts.name }).from(debts).where(eq(debts.isExample, true)),
    db.select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.isExample, true)),
    db.select({ id: income.id }).from(income).where(eq(income.isExample, true)),
  ]);
  return { debts: d, entities: e, incomeCount: i.length, total: d.length + e.length + i.length };
}

/**
 * Delete example debts (their payments, settlements, negotiations, offers, contacts and tax notes go with
 * them), example income, and example entities that no longer have any debt.
 */
export async function clearExample(db: Db): Promise<{ debts: number; entities: number; income: number }> {
  const exampleDebts = await db.select({ id: debts.id }).from(debts).where(eq(debts.isExample, true));
  if (exampleDebts.length) {
    // Sent-reminder records start with the debt id, so they are cleaned up too.
    await db.delete(reminderSent).where(or(...exampleDebts.map((d) => like(reminderSent.key, `${d.id}:%`))));
  }
  const removedDebts = await db.delete(debts).where(eq(debts.isExample, true)).returning({ id: debts.id });
  const removedIncome = await db.delete(income).where(eq(income.isExample, true)).returning({ id: income.id });
  const removedEntities = await db
    .delete(entities)
    .where(sql`${entities.isExample} = true and not exists (select 1 from debts d where d.entity_id = ${entities.id})`)
    .returning({ id: entities.id });
  return { debts: removedDebts.length, entities: removedEntities.length, income: removedIncome.length };
}

/** Adding real data under an example entity turns that entity into a real one, so clearing keeps it. */
export async function markEntityReal(db: Db, entityId: string) {
  await db.update(entities).set({ isExample: false }).where(eq(entities.id, entityId));
}
