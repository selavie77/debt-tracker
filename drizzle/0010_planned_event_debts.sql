CREATE TABLE "planned_event_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"event_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	CONSTRAINT "planned_event_debts_unique" UNIQUE("event_id","debt_id")
);
--> statement-breakpoint
ALTER TABLE "planned_event_debts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planned_event_debts" ADD CONSTRAINT "planned_event_debts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_event_debts" ADD CONSTRAINT "planned_event_debts_event_id_planned_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."planned_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_event_debts" ADD CONSTRAINT "planned_event_debts_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_event_debts_owner_idx" ON "planned_event_debts" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "planned_event_debts_owner_only" ON "planned_event_debts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("planned_event_debts"."owner_id" = (select auth.uid())) WITH CHECK ("planned_event_debts"."owner_id" = (select auth.uid()));