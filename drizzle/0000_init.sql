CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"creditor" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"original_cents" integer NOT NULL,
	"rate_bps" integer,
	"collateral" text DEFAULT '' NOT NULL,
	"personal_guarantee" boolean DEFAULT false NOT NULL,
	"government" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"delinquent_since" date,
	"monthly_payment_cents" integer,
	"payment_day" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"interest_cents" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"agreed_cents" integer NOT NULL,
	"installment_cents" integer NOT NULL,
	"installments" integer NOT NULL,
	"agreed_on" date NOT NULL,
	"first_payment_on" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_debt_id_unique" UNIQUE("debt_id")
);
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debts_entity_idx" ON "debts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "debts_owner_idx" ON "debts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "entities_owner_idx" ON "entities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "payments_debt_idx" ON "payments" USING btree ("debt_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_owner_idx" ON "payments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "settlements_owner_idx" ON "settlements" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "debts_owner_only" ON "debts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("debts"."owner_id" = (select auth.uid())) WITH CHECK ("debts"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "entities_owner_only" ON "entities" AS PERMISSIVE FOR ALL TO "authenticated" USING ("entities"."owner_id" = (select auth.uid())) WITH CHECK ("entities"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "payments_owner_only" ON "payments" AS PERMISSIVE FOR ALL TO "authenticated" USING ("payments"."owner_id" = (select auth.uid())) WITH CHECK ("payments"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "settlements_owner_only" ON "settlements" AS PERMISSIVE FOR ALL TO "authenticated" USING ("settlements"."owner_id" = (select auth.uid())) WITH CHECK ("settlements"."owner_id" = (select auth.uid()));