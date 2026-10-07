ALTER TABLE "debts" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Mark the example data created before this flag existed (exact names and amounts only).
UPDATE "debts" SET "is_example" = true
WHERE ("name", "original_cents") IN (
  ('IRS federal tax', 12000000), ('New York State tax', 3000000), ('HBJ Financial business loan', 15500000),
  ('Credit cards (5 accounts)', 10000000), ('SBA EIDL loan', 15000000), ('Solar panel loan', 2800000),
  ('Window replacement loan', 2100000), ('American Express business card', 1200000)
);--> statement-breakpoint
UPDATE "entities" SET "is_example" = true
WHERE "name" IN ('Francis (personal)', 'Operating Co. LLC')
  AND NOT EXISTS (SELECT 1 FROM "debts" d WHERE d."entity_id" = "entities"."id" AND d."is_example" = false);--> statement-breakpoint
UPDATE "income" SET "is_example" = true
WHERE "name" = 'Salary' AND "amount_cents" = 210000 AND "day_of_month" IN (1, 16);
