ALTER TABLE "inbound_order_items" ADD COLUMN "production_date" date;--> statement-breakpoint
ALTER TABLE "inbound_order_items" ADD COLUMN "expiry_date" date;--> statement-breakpoint
ALTER TABLE "inbound_order_items" ADD COLUMN "batch_no" varchar(64);--> statement-breakpoint
ALTER TABLE "return_order_items" ADD COLUMN "shipment_item_id" uuid;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "processed_by" uuid;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_orders" ADD COLUMN "processed_note" text;--> statement-breakpoint
ALTER TABLE "return_order_items" ADD CONSTRAINT "return_order_items_shipment_item_id_shipment_items_id_fk" FOREIGN KEY ("shipment_item_id") REFERENCES "public"."shipment_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_order_items_shipment_item_idx" ON "return_order_items" USING btree ("shipment_item_id");