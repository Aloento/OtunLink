CREATE TABLE "retail_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_unit_id" uuid NOT NULL,
	"retailer_unit_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retail_partnerships" ADD CONSTRAINT "retail_partnerships_warehouse_unit_id_business_units_id_fk" FOREIGN KEY ("warehouse_unit_id") REFERENCES "public"."business_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_partnerships" ADD CONSTRAINT "retail_partnerships_retailer_unit_id_business_units_id_fk" FOREIGN KEY ("retailer_unit_id") REFERENCES "public"."business_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_partnerships" ADD CONSTRAINT "retail_partnerships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_partnerships_pair_unique" ON "retail_partnerships" USING btree ("warehouse_unit_id","retailer_unit_id");--> statement-breakpoint
CREATE INDEX "retail_partnerships_retailer_idx" ON "retail_partnerships" USING btree ("retailer_unit_id");