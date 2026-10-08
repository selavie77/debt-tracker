ALTER TABLE "income" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "confidence_percent" integer;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "income" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "income" ADD CONSTRAINT "income_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;