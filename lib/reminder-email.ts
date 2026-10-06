import { isTimeSensitive, type Reminder } from "./negotiation";

// Builds the reminder email. Debt names appear in it, but amounts and balances do not.

export const APP_URL = (process.env.APP_URL ?? "https://thedebtplaybook.com").replace(/\/$/, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Digest = { subject: string; text: string; html: string; count: number };

export function buildDigest(reminders: Reminder[], opts: { test?: boolean } = {}): Digest {
  const urgent = reminders.filter(isTimeSensitive);
  const late = reminders.filter((r) => !isTimeSensitive(r));
  const dash = `${APP_URL}/dashboard`;
  const settings = `${APP_URL}/settings`;

  const subject = opts.test
    ? "The Debt Playbook: test email"
    : urgent.length === 1
      ? `The Debt Playbook: ${urgent[0].title}`
      : `The Debt Playbook: ${urgent.length} items need attention`;

  const intro = opts.test
    ? urgent.length + late.length === 0
      ? "This is a test. Email reminders are working. Nothing needs attention right now."
      : "This is a test. Email reminders are working. Here is what would be sent today."
    : "These items need attention:";

  const lines = (list: Reminder[]) => list.map((r) => `- ${r.title}. ${r.detail}`);
  const text = [
    intro,
    "",
    ...(urgent.length ? lines(urgent) : []),
    ...(late.length ? ["", "Also late:", ...lines(late)] : []),
    "",
    `Open your dashboard: ${dash}`,
    "",
    `You get this because email reminders are on. Turn them off any time: ${settings}`,
    "This is a reminder from a record-keeping tool, not legal, tax or financial advice.",
  ].join("\n");

  const li = (r: Reminder) => `<li style="margin:0 0 10px"><b>${esc(r.title)}</b><br><span style="color:#566872">${esc(r.detail)}</span></li>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#12202a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d3dcdf;border-radius:10px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0b6b66"><b>The Debt Playbook</b></p>
<p style="margin:0 0 16px;font-size:16px">${esc(intro)}</p>
${urgent.length ? `<ul style="padding-left:18px;margin:0 0 16px">${urgent.map(li).join("")}</ul>` : ""}
${late.length ? `<p style="margin:16px 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#566872">Also late</p><ul style="padding-left:18px;margin:0 0 16px">${late.map(li).join("")}</ul>` : ""}
<p style="margin:20px 0"><a href="${esc(dash)}" style="background:#0b6b66;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">Open your dashboard</a></p>
<p style="margin:0;font-size:12px;color:#566872;line-height:1.5">You get this because email reminders are on. <a href="${esc(settings)}" style="color:#0b6b66">Turn them off any time</a>.<br>This is a reminder from a record-keeping tool, not legal, tax or financial advice.</p>
</div></body></html>`;

  return { subject, text, html, count: urgent.length };
}
