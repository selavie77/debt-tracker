CREATE TABLE "notification_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"email_reminders" boolean DEFAULT false NOT NULL,
	"last_sent_on" date,
	"last_test_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminder_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"key" text NOT NULL,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sent_owner_key" UNIQUE("owner_id","key")
);
--> statement-breakpoint
ALTER TABLE "reminder_sent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sent" ADD CONSTRAINT "reminder_sent_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "notification_prefs_owner_only" ON "notification_prefs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("notification_prefs"."owner_id" = (select auth.uid())) WITH CHECK ("notification_prefs"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "reminder_sent_owner_only" ON "reminder_sent" AS PERMISSIVE FOR ALL TO "authenticated" USING ("reminder_sent"."owner_id" = (select auth.uid())) WITH CHECK ("reminder_sent"."owner_id" = (select auth.uid()));