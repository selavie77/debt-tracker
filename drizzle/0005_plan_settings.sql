CREATE TABLE "plan_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"living_costs_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_settings_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "plan_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD CONSTRAINT "plan_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "plan_settings_owner_only" ON "plan_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ("plan_settings"."owner_id" = (select auth.uid())) WITH CHECK ("plan_settings"."owner_id" = (select auth.uid()));