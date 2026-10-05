import { usd } from "./money";

// Sample wording for common creditor letters. Plain text the user copies and edits.
// These are starting points only, not legal advice.

export type TemplateCtx = {
  debtName: string;
  creditor: string;
  entityName: string;
  originalCents: number;
  agreedCents?: number | null;
  installments?: number | null;
  today: string;
};

export type Template = { id: string; title: string; when: string; body: (c: TemplateCtx) => string };

const who = (c: TemplateCtx) => c.creditor || "Creditor name";

export const TEMPLATES: Template[] = [
  {
    id: "offer",
    title: "Settlement offer letter",
    when: "When you are ready to make an offer",
    body: (c) => `${c.today}

To: ${who(c)}
Re: ${c.debtName} (${c.entityName}), account number [account number]

I am writing to propose a settlement of the above account, which has an original balance of ${usd(c.originalCents)}.

My offer is ${c.agreedCents ? usd(c.agreedCents) : "[amount]"}${c.installments && c.installments > 1 ? `, paid in ${c.installments} equal monthly payments beginning [date]` : ", paid in one payment"}. This offer is based on my current financial situation, which I can document on request.

If you accept, please confirm the terms in writing, including that the account will be treated as fully settled and that no further amount will be owed once the final payment is received. I will not make any payment until I have the written confirmation.

Sincerely,
[Your name]
[Contact details]`,
  },
  {
    id: "confirm",
    title: "Request written confirmation",
    when: "After a phone agreement",
    body: (c) => `${c.today}

To: ${who(c)}
Re: ${c.debtName}, account number [account number]

Thank you for speaking with me on [date of call] with [representative name]. As discussed, we agreed to settle this account for ${c.agreedCents ? usd(c.agreedCents) : "[amount]"}${c.installments && c.installments > 1 ? `, paid in ${c.installments} monthly payments` : ""}.

Please send me a written agreement that states:
- the total settlement amount and the payment schedule
- that the account is fully settled once the final payment is made
- how the account will be reported afterward

I will begin payments after I receive and review this document.

Sincerely,
[Your name]`,
  },
  {
    id: "paid",
    title: "Request paid-in-full letter",
    when: "After the final payment",
    body: (c) => `${c.today}

To: ${who(c)}
Re: ${c.debtName}, account number [account number]

I made the final payment under our settlement agreement on [date]. Please send me a letter confirming that the account is settled in full and that I owe nothing further.

Please also confirm how the account will be reported to credit bureaus and, where applicable, whether you will issue any tax form (such as a 1099-C) for the settled amount.

Sincerely,
[Your name]`,
  },
];
