// Sends email through the Resend HTTP API. Needs RESEND_API_KEY in the environment.
// Nothing here logs message bodies, addresses or keys.

export const FROM = "The Debt Playbook <reminders@updates.thedebtplaybook.com>";

export type SendResult = { ok: true } | { ok: false; error: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email is not set up on the server yet (missing RESEND_API_KEY)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    let detail = "";
    try {
      detail = String(((await res.json()) as { message?: string }).message ?? "");
    } catch {
      /* no JSON body */
    }
    return { ok: false, error: `Resend rejected the email (${res.status}). ${detail}`.trim() };
  } catch (e) {
    return { ok: false, error: `Could not reach Resend: ${(e as Error).message}` };
  }
}
