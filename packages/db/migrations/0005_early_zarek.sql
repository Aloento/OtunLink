ALTER TYPE "public"."batch_source_type" ADD VALUE 'RETURNS_PENDING';--> statement-breakpoint
ALTER TABLE "return_order_items" ADD COLUMN "sales_order_item_id" uuid;--> statement-breakpoint
ALTER TABLE "return_order_items" ADD COLUMN "received_qty" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "return_order_items" ADD CONSTRAINT "return_order_items_sales_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("sales_order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_order_items_sales_item_idx" ON "return_order_items" USING btree ("sales_order_item_id");