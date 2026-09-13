ALTER TABLE "sales_order_items" ADD COLUMN "list_price_currency" varchar(3);--> statement-breakpoint
UPDATE "sales_order_items"
SET "list_price_currency" = "sales_orders"."currency"
FROM "sales_orders"
WHERE "sales_orders"."id" = "sales_order_items"."sales_order_id"
  AND "sales_order_items"."list_price" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "business_units" DROP COLUMN "base_currency";