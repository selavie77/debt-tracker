"use client";

import { useState } from "react";

/** Copies text to the clipboard. Falls back to selecting the text when the browser refuses. */
export function CopyButton({ text, targetId }: { text: string; targetId?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2200);
  }
  return (
    <button type="button" className="btn ghost small" onClick={copy}>
      {state === "done" ? "Copied" : state === "failed" ? "Press Ctrl+C to copy" : "Copy text"}
    </button>
  );
}
