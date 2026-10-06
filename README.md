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
