"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; ok?: string } | undefined;

const creds = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string(),
});

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `http://${h.get("host")}`;
}

/** One form, three buttons: sign in, create account, or email me a sign-in link. */
export async function authenticate(_: AuthState, fd: FormData): Promise<AuthState> {
  const intent = String(fd.get("intent") ?? "signin");
  const p = creds.safeParse({ email: fd.get("email"), password: String(fd.get("password") ?? "") });
  if (!p.success) return { error: p.error.issues[0].message };
  const { email, password } = p.data;
  const supabase = await createClient();
  const emailRedirectTo = `${await origin()}/auth/callback`;

  if (intent === "link") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    return error ? { error: error.message } : { ok: "Check your email for a sign-in link." };
  }
  if (intent === "signup") {
    if (password.length < 10) return { error: "Use a password of at least 10 characters" };
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
    if (error) return { error: error.message };
    if (!data.session) return { ok: "Account created. Check your email to confirm it, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "Email or password is not right" };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
