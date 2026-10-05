"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** A form bound to a server action that shows its error or success message. */
export function ActionForm({ action, submitLabel, resetOnSuccess, className = "form", children }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="wide actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </button>
        {state?.error && <span className="msg err" role="alert">{state.error}</span>}
        {state?.ok && <span className="msg ok" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
