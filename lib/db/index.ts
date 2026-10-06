import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { redirect } from "next/navigation";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import * as schema from "./schema";
import { serialize } from "./serial";

export type Db = NodePgDatabase<typeof schema>;

// One pool per process (survives dev hot reloads). Kept small: Supabase's pooler has a connection cap.
const g = globalThis as unknown as { __pool?: Pool };
export const pool =
  (g.__pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  }));

/** The signed-in user, or a redirect to /login. Verified with Supabase, not just read from the cookie. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}

/**
 * Run database work as a given user, inside one transaction.
 * The transaction switches to the `authenticated` role and sets the user's id, so Postgres
 * row-level security hides every other user's rows even if the app code has a bug.
 * Call redirect() after this returns, not inside it (a redirect throws and would roll back).
 */
export async function runAsUser<T>(userId: string, fn: (db: Db, userId: string) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
      userId,
    ]);
    await client.query("set local role authenticated");
    const result = await fn(drizzle(serialize(client), { schema }), userId);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Run database work as the signed-in user (see runAsUser). */
export async function withUser<T>(fn: (db: Db, userId: string) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return runAsUser(user.id, fn);
}
