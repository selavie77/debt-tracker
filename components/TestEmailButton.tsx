"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/app/actions";

/** Button that runs a server action and shows its result next to it. */
export function ActionButton({ action, label, className = "btn ghost" }: { action: () => Promise<FormState>; label: string; className?: string }) {
  const [state, setState] = useState<FormState>();
  const [pending, start] = useTransition();
  return (
    <div className="actions">
      <button type="button" className={className} disabled={pending} onClick={() => start(async () => setState(await action()))}>
        {pending ? "Working..." : label}
      </button>
      {state?.error && <span className="msg err" role="alert">{state.error}</span>}
      {state?.ok && <span className="msg ok" role="status">{state.ok}</span>}
    </div>
  );
}
