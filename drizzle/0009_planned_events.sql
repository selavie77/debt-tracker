CREATE TABLE "planned_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"direction" text DEFAULT 'in' NOT NULL,
	"amount_cents" integer NOT NULL,
	"expected_month" date NOT NULL,
	"confidence_percent" integer DEFAULT 100 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD COLUMN "cash_on_hand_cents" integer;--> statement-breakpoint
ALTER TABLE "planned_events" ADD CONSTRAINT "planned_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_events_owner_idx" ON "planned_events" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "planned_events_owner_only" ON "planned_events" AS PERMISSIVE FOR ALL TO "authenticated" USING ("planned_events"."owner_id" = (select auth.uid())) WITH CHECK ("planned_events"."owner_id" = (select auth.uid()));