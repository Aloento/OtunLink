CREATE TABLE "bundle_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_item_id" uuid NOT NULL,
	"component_item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "bundle_item_id" uuid;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_item_id_items_id_fk" FOREIGN KEY ("bundle_item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_component_item_id_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_components_unique" ON "bundle_components" USING btree ("bundle_item_id","component_item_id");--> statement-breakpoint
CREATE INDEX "bundle_components_bundle_idx" ON "bundle_components" USING btree ("bundle_item_id");--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_bundle_item_id_items_id_fk" FOREIGN KEY ("bundle_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_order_items_bundle_idx" ON "sales_order_items" USING btree ("bundle_item_id");