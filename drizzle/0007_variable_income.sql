ALTER TABLE "income" ADD COLUMN "kind" text DEFAULT 'steady' NOT NULL;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "low_cents" integer;