CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"contacted_on" date NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"day_of_month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"stage" text DEFAULT 'silence' NOT NULL,
	"stage_changed_on" date NOT NULL,
	"silence_started_on" date,
	"silence_days" integer,
	"next_action_on" date,
	"next_action_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiations_debt_id_unique" UNIQUE("debt_id")
);
--> statement-breakpoint
ALTER TABLE "negotiations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"made_on" date NOT NULL,
	"party" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"installments" integer,
	"expires_on" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_debt_idx" ON "contacts" USING btree ("debt_id","contacted_on");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "income_owner_idx" ON "income" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "negotiations_owner_idx" ON "negotiations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "offers_debt_idx" ON "offers" USING btree ("debt_id","made_on");--> statement-breakpoint
CREATE INDEX "offers_owner_idx" ON "offers" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "contacts_owner_only" ON "contacts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("contacts"."owner_id" = (select auth.uid())) WITH CHECK ("contacts"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "income_owner_only" ON "income" AS PERMISSIVE FOR ALL TO "authenticated" USING ("income"."owner_id" = (select auth.uid())) WITH CHECK ("income"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "negotiations_owner_only" ON "negotiations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("negotiations"."owner_id" = (select auth.uid())) WITH CHECK ("negotiations"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "offers_owner_only" ON "offers" AS PERMISSIVE FOR ALL TO "authenticated" USING ("offers"."owner_id" = (select auth.uid())) WITH CHECK ("offers"."owner_id" = (select auth.uid()));