CREATE TABLE "tax_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"form_received" boolean DEFAULT false NOT NULL,
	"reviewed_with_pro" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_items_debt_id_unique" UNIQUE("debt_id")
);
--> statement-breakpoint
ALTER TABLE "tax_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_items" ADD CONSTRAINT "tax_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_items" ADD CONSTRAINT "tax_items_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_items_owner_idx" ON "tax_items" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "tax_items_owner_only" ON "tax_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ("tax_items"."owner_id" = (select auth.uid())) WITH CHECK ("tax_items"."owner_id" = (select auth.uid()));