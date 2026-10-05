"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(authenticate, undefined);
  return (
    <form action={action} className="form" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <label>Email
        <input type="text" inputMode="email" name="email" autoComplete="email" required />
      </label>
      <label>Password
        <input type="password" name="password" autoComplete="current-password" />
      </label>
      <div className="actions">
        <button className="btn" type="submit" name="intent" value="signin" disabled={pending}>Sign in</button>
        <button className="btn ghost" type="submit" name="intent" value="signup" disabled={pending}>Create account</button>
        <button className="btn ghost" type="submit" name="intent" value="link" disabled={pending}>Email me a link</button>
      </div>
      {state?.error && <span className="msg err" role="alert">{state.error}</span>}
      {state?.ok && <span className="msg ok" role="status">{state.ok}</span>}
      <p className="note">Passwords need at least 10 characters. A sign-in link needs no password.</p>
    </form>
  );
}
