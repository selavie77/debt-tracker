# Debt Elimination Tracker (Phase 1)

Track debts, settlements and payments across people and companies. Neutral tracking only, no advice.

## Stack
- Next.js 15 (App Router, server actions) with TypeScript
- Supabase: Auth for login, Postgres for data
- Drizzle ORM (schema and migrations), Zod for input checks, Vitest for tests

## Setup
1. Copy the Supabase values into `.env.local` (this file is git-ignored):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Use the **Session pooler** string (works over IPv4). URL-encode special characters in the password.
2. `npm install`
3. `npm run db:migrate` (creates the tables and security policies)
4. `npm run dev` and open http://localhost:3000. Create an account, then use "Load example data" or add your own.

## Commands
| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for balances, schedules, amortization, CSV |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Create a migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database |
| `node scripts/rls-test.cjs` | Prove users cannot see each other's data on every table (rolls back, saves nothing) |
| `npx tsx scripts/smoke-test.ts` | Load example data as a throwaway user and run the real queries, reminders and calendar (rolls back) |

## Email reminders
A daily job (`vercel.json` cron, 13:00 UTC) emails users who turned reminders on in Settings. It sends at most one email a day, only when something time-sensitive is new (silence period ending, counter-offer expiring, next action due), and once per countdown step (14, 7, 3, 1, 0 days, then once overdue). Late debts alone never trigger an email. Emails include debt names, not balances.

Environment variables on Vercel (never commit them):
- `RESEND_API_KEY`: a Resend key with sending access for `updates.thedebtplaybook.com`
- `CRON_SECRET`: a long random string. Vercel sends it as `Authorization: Bearer ...` to `/api/cron/reminders`, which rejects anything else.
- `APP_URL` (optional): defaults to `https://thedebtplaybook.com`

Test the job end to end with a throwaway user and a fake sender: `npx tsx scripts/reminders-job-test.ts`.

## Plan
`/plan` turns the data into a plain-language summary, next steps, an order to look at the debts (by how strongly a creditor can collect, then lateness, then interest), a payoff simulator (extra payments, avalanche or snowball, and a settlement what-if) and "did you know" notes. It is rule-based, so every sentence comes from fixed rules and the user's own numbers, and nothing is sent to an outside service. It lists facts, options to consider and questions to ask, and never tells anyone to stop paying or which option to pick. Code: `lib/plan/` (`simulate.ts`, `guidance.ts`, `build.ts`), all pure and tested. Preview on example data: `npx tsx scripts/plan-smoke-test.ts`.

## What you expect
`/expect` is where the user enters their own guesses about the next months: cash on hand, business income forecasts (a monthly amount, a confidence level, which business entity, which months) and one-time events such as selling a property (an amount, a month, a confidence level, and the debts it would pay off).

How the plan counts them (`lib/plan/income.ts`, `lib/plan/events.ts`):
- Business income is recurring, so it is counted as amount x confidence.
- A one-time event either happens or it does not, so it is never scaled by confidence. In the "What you expect" view it counts in full when money in is at least 50% sure (money out from 25%, so a possible bill is not ignored). The "Best case" view counts every event. "Paychecks only" counts none.
- When an event happens it pays off the debts it names, in the plan's own order (most serious first), for as long as the money covers them. A debt that does not fit is left alone and reported as not covered, with how far short it is. Paid-off debts' monthly payments stop from the next month, in the same view.

`lib/plan/payoff.ts` lists what leftover cash could also cover. Regression test for the whole flow: `lib/plan/build.test.ts`. Test on the real database with a throwaway user: `npx tsx scripts/forecast-smoke-test.ts`.
## Living costs
`/living-costs` lets the user list each cost separately (Netflix, phone, gas, electricity) with a category and how often it is paid. `lib/expenses.ts` turns weekly, every-two-weeks, quarterly and yearly amounts into an average month and totals them by category. When any itemized costs exist their total is what the Plan uses; otherwise the single "living costs" number from `plan_settings` is used. Test on the real database with a throwaway user: `npx tsx scripts/expenses-smoke-test.ts`.

## Example data
Example debts, entities and income carry `is_example = true`. Settings shows what will be removed and a confirm button; `lib/example-data.ts` deletes only those rows (and example entities with no remaining debt). Adding a real debt under an example entity turns that entity into a real one. Test: `npx tsx scripts/example-data-test.ts`.

## How user data is protected
- Every table has `owner_id` (defaults to the signed-in user) and a row-level-security policy: `owner_id = auth.uid()`.
- `withUser()` in `lib/db/index.ts` runs each request in a transaction as the `authenticated` role with the user's id set, so Postgres enforces the policy even if app code has a bug.
- `middleware.ts` sends signed-out visitors to `/login`. User identity is verified with Supabase on every request.

## Layout
- `lib/finance.ts`: all money logic (pure, tested).
- `lib/db/schema.ts`: tables and policies. Money is integer cents.
- `app/actions.ts`: server actions. `app/login/`: sign in, sign up, email link. `app/auth/callback`: sign-in link landing.
- `app/(app)/`: Dashboard, Debts, Debt detail, Negotiations, Calendar, Compare, Tax review, Reports (with CSV export), Entities, Import (all require login).
- `lib/compare.ts`, `lib/tax.ts`, `lib/reports.ts`: side-by-side facts, tax-review flags and totals/exports. Facts and reminders only, never advice.
- `lib/negotiation.ts`: stages, silence timer, dashboard reminders. `lib/calendar.ts`: month view logic. `lib/templates.ts`: sample letters. All pure and tested.
- `app/negotiation-actions.ts`: negotiation, offer, contact and income actions.

## How balances work
- Without a settlement: original balance minus principal paid (payment minus interest part).
- With a settlement: the agreed amount minus payments made on or after the agreement date.
- Eliminated = balance just before the agreement minus the agreed amount.
