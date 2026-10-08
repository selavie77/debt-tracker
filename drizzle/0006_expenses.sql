CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'personal' NOT NULL,
	"amount_cents" integer NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_owner_idx" ON "expenses" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "expenses_owner_only" ON "expenses" AS PERMISSIVE FOR ALL TO "authenticated" USING ("expenses"."owner_id" = (select auth.uid())) WITH CHECK ("expenses"."owner_id" = (select auth.uid()));