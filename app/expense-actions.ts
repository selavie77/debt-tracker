"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { parseExpense } from "@/lib/expenses";
import type { FormState } from "./actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => {
  revalidatePath("/living-costs");
  revalidatePath("/plan");
};
const input = (fd: FormData) => ({ name: str(fd, "name"), category: str(fd, "category"), amount: str(fd, "amount"), frequency: str(fd, "frequency") });

export async function addExpense(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseExpense(input(fd));
  if ("error" in p) return { error: p.error };
  await withUser((db) => db.insert(expenses).values(p.row));
  refresh();
  return { ok: `Added ${p.row.name}` };
}

export async function updateExpense(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = parseExpense(input(fd));
  if ("error" in p) return { error: p.error };
  await withUser((db) => db.update(expenses).set(p.row).where(eq(expenses.id, id)));
  refresh();
  return { ok: "Saved" };
}

export async function deleteExpense(id: string) {
  await withUser((db) => db.delete(expenses).where(eq(expenses.id, id)));
  refresh();
}

export async function clearExpenses(): Promise<FormState> {
  await withUser((db) => db.delete(expenses)); // row-level security limits this to the signed-in user's rows
  refresh();
  return { ok: "Cleared" };
}
