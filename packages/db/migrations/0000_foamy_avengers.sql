CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_no" varchar(64),
	"production_date" date,
	"expiry_date" date,
	"source_type" "batch_source_type" DEFAULT 'MANUAL' NOT NULL,
	"source_order_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "unit_type" NOT NULL,
	"address" text,
	"contact" text,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"base_currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "discrepancy_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"shipment_item_id" uuid NOT NULL,
	"expected_qty_before" numeric(12, 2) NOT NULL,
	"actual_qty" numeric(12, 2) NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "discrepancy_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" "discrepancy_review_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"photo_file_ids" uuid[],
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" varchar(256) NOT NULL,
	"subject" varchar(512),
	"status" "email_log_status" DEFAULT 'PENDING' NOT NULL,
	"provider" varchar(64),
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(256) NOT NULL,
	"thumbnail_key" varchar(256),
	"mime" varchar(64) NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "inbound_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"line_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_no" varchar(64) NOT NULL,
	"source_type" "inbound_source_type" NOT NULL,
	"shipment_id" uuid,
	"warehouse_unit_id" uuid NOT NULL,
	"counterparty_unit_id" uuid,
	"status" "inbound_status" DEFAULT 'DRAFT' NOT NULL,
	"remark" text,
	"photo_file_ids" uuid[],
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_orders_inbound_no_unique" UNIQUE("inbound_no")
);
--> statement-breakpoint
CREATE TABLE "item_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(64),
	"name" varchar(256) NOT NULL,
	"barcode" varchar(128),
	"spec_unit" "spec_unit" DEFAULT 'PIECE' NOT NULL,
	"inner_unit" "spec_unit",
	"inner_count" numeric(12, 2),
	"is_perishable" boolean DEFAULT false NOT NULL,
	"category" varchar(128),
	"description" text,
	"status" "item_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"unit_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text,
	"link" varchar(512),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_target_check" CHECK ("notifications"."user_id" IS NOT NULL OR "notifications"."unit_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "outbound_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbound_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbound_no" varchar(64) NOT NULL,
	"type" "outbound_type" DEFAULT 'NORMAL' NOT NULL,
	"warehouse_unit_id" uuid NOT NULL,
	"counterparty_unit_id" uuid,
	"status" "outbound_status" DEFAULT 'DRAFT' NOT NULL,
	"loss_reason" text,
	"photo_file_ids" uuid[],
	"remark" text,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_orders_outbound_no_unique" UNIQUE("outbound_no")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"method_note" varchar(256),
	"proof_file_id" uuid,
	"refund_note" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_sales_order_id_unique" UNIQUE("sales_order_id")
);
--> statement-breakpoint
CREATE TABLE "retail_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"original_batch_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_no" varchar(64) NOT NULL,
	"source_type" "return_source_type" NOT NULL,
	"shipment_id" uuid,
	"sales_order_id" uuid,
	"from_unit_id" uuid NOT NULL,
	"to_unit_id" uuid NOT NULL,
	"status" "return_status" NOT NULL,
	"reason" text,
	"note" text,
	"photo_file_ids" uuid[],
	"return_carrier" varchar(64),
	"return_tracking_no" varchar(128),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_orders_return_no_unique" UNIQUE("return_no")
);
--> statement-breakpoint
CREATE TABLE "sales_batch_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"list_price" numeric(12, 2),
	"price" numeric(12, 2),
	"line_total" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_no" varchar(64) NOT NULL,
	"seller_unit_id" uuid NOT NULL,
	"buyer_unit_id" uuid NOT NULL,
	"source" "sales_source" DEFAULT 'RETAILER_REQUEST' NOT NULL,
	"delivery_method" "delivery_method" DEFAULT 'PICKUP' NOT NULL,
	"delivery_address" text,
	"freight" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"total_amount" numeric(12, 2),
	"status" "sales_status" DEFAULT 'DRAFT' NOT NULL,
	"remark" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_sales_no_unique" UNIQUE("sales_no"),
	CONSTRAINT "sales_orders_discount_percent_range" CHECK ("sales_orders"."discount_percent" >= 0 AND "sales_orders"."discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"item_id" uuid,
	"name" varchar(256) NOT NULL,
	"spec" varchar(64),
	"expected_qty" numeric(12, 2) NOT NULL,
	"actual_qty" numeric(12, 2),
	"unit_price" numeric(12, 2),
	"production_date" date,
	"expiry_date" date,
	"line_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_trackings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"carrier" varchar(64) NOT NULL,
	"tracking_no" varchar(128) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_no" varchar(64) NOT NULL,
	"shipper_unit_id" uuid NOT NULL,
	"receiver_unit_id" uuid NOT NULL,
	"status" "shipment_status" DEFAULT 'DRAFT' NOT NULL,
	"boxes_count" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"expected_arrival_date" date,
	"remark" text,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_shipment_no_unique" UNIQUE("shipment_no")
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"unit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"qty" numeric(12, 2) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_unit_id_item_id_batch_id_pk" PRIMARY KEY("unit_id","item_id","batch_id"),
	CONSTRAINT "stock_qty_nonnegative" CHECK ("stock"."qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"qty_delta" numeric(12, 2) NOT NULL,
	"qty_before" numeric(12, 2) NOT NULL,
	"qty_after" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"order_type" varchar(32),
	"order_id" uuid,
	"ref_no" varchar(64),
	"note" text,
	"operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_sub" varchar(128) NOT NULL,
	"email" varchar(256) NOT NULL,
	"name" varchar(128) NOT NULL,
	"role" "user_role",
	"scope_unit_id" uuid,
	"status" "user_status" DEFAULT 'PENDING' NOT NULL,
	"locale" varchar(8) DEFAULT 'zh-CN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_sub_unique" UNIQUE("entra_sub")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancy_review_items" ADD CONSTRAINT "discrepancy_review_items_review_id_discrepancy_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."discrepancy_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancy_review_items" ADD CONSTRAINT "discrepancy_review_items_shipment_item_id_shipment_items_id_fk" FOREIGN KEY ("shipment_item_id") REFERENCES "public"."shipment_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancy_reviews" ADD CONSTRAINT "discrepancy_reviews_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancy_reviews" ADD CONSTRAINT "discrepancy_reviews_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancy_reviews" ADD CONSTRAINT "discrepancy_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_inbound_order_id_inbound_orders_id_fk" FOREIGN KEY ("inbound_order_id") REFERENCES "public"."inbound_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_warehouse_unit_id_business_units_id_fk" FOREIGN KEY ("warehouse_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_counterparty_unit_id_business_units_id_fk" FOREIGN KEY ("counterparty_unit_id") REFERENCES "public"."business_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_unit_id_business_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."business_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_outbound_order_id_outbound_orders_id_fk" FOREIGN KEY ("outbound_order_id") REFERENCES "public"."outbound_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_warehouse_unit_id_business_units_id_fk" FOREIGN KEY ("warehouse_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_counterparty_unit_id_business_units_id_fk" FOREIGN KEY ("counterparty_unit_id") REFERENCES "public"."business_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_price_history" ADD CONSTRAINT "retail_price_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_unit_id_business_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_order_items" ADD CONSTRAINT "return_order_items_return_order_id_return_orders_id_fk" FOREIGN KEY ("return_order_id") REFERENCES "public"."return_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_order_items" ADD CONSTRAINT "return_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_order_items" ADD CONSTRAINT "return_order_items_original_batch_id_batches_id_fk" FOREIGN KEY ("original_batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_from_unit_id_business_units_id_fk" FOREIGN KEY ("from_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_to_unit_id_business_units_id_fk" FOREIGN KEY ("to_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_orders" ADD CONSTRAINT "return_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_batch_allocations" ADD CONSTRAINT "sales_batch_allocations_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_batch_allocations" ADD CONSTRAINT "sales_batch_allocations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_seller_unit_id_business_units_id_fk" FOREIGN KEY ("seller_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_buyer_unit_id_business_units_id_fk" FOREIGN KEY ("buyer_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_trackings" ADD CONSTRAINT "shipment_trackings_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shipper_unit_id_business_units_id_fk" FOREIGN KEY ("shipper_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_receiver_unit_id_business_units_id_fk" FOREIGN KEY ("receiver_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_unit_id_business_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_scope_unit_id_business_units_id_fk" FOREIGN KEY ("scope_unit_id") REFERENCES "public"."business_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "batches_item_idx" ON "batches" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "batches_expiry_idx" ON "batches" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_item_batch_unique" ON "batches" USING btree ("item_id","batch_no") WHERE "batches"."batch_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discrepancy_review_items_review_idx" ON "discrepancy_review_items" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discrepancy_reviews_one_pending_unique" ON "discrepancy_reviews" USING btree ("shipment_id") WHERE "discrepancy_reviews"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "discrepancy_reviews_shipment_idx" ON "discrepancy_reviews" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbound_order_items_order_idx" ON "inbound_order_items" USING btree ("inbound_order_id");--> statement-breakpoint
CREATE INDEX "inbound_orders_warehouse_idx" ON "inbound_orders" USING btree ("warehouse_unit_id");--> statement-breakpoint
CREATE INDEX "inbound_orders_shipment_idx" ON "inbound_orders" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "item_images_item_idx" ON "item_images" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "items_name_idx" ON "items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "items_barcode_active_unique" ON "items" USING btree ("barcode") WHERE "items"."status" = 'ACTIVE' AND "items"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unit_idx" ON "notifications" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "outbound_order_items_order_idx" ON "outbound_order_items" USING btree ("outbound_order_id");--> statement-breakpoint
CREATE INDEX "outbound_orders_warehouse_idx" ON "outbound_orders" USING btree ("warehouse_unit_id");--> statement-breakpoint
CREATE INDEX "payments_sales_order_idx" ON "payments" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "retail_price_history_unit_item_idx" ON "retail_price_history" USING btree ("unit_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_prices_unit_item_unique" ON "retail_prices" USING btree ("unit_id","item_id");--> statement-breakpoint
CREATE INDEX "retail_prices_item_idx" ON "retail_prices" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "return_order_items_order_idx" ON "return_order_items" USING btree ("return_order_id");--> statement-breakpoint
CREATE INDEX "return_orders_shipment_idx" ON "return_orders" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "return_orders_sales_idx" ON "return_orders" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "return_orders_from_idx" ON "return_orders" USING btree ("from_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_batch_allocations_item_batch_unique" ON "sales_batch_allocations" USING btree ("order_item_id","batch_id");--> statement-breakpoint
CREATE INDEX "sales_batch_allocations_batch_idx" ON "sales_batch_allocations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_order_idx" ON "sales_order_items" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_orders_seller_idx" ON "sales_orders" USING btree ("seller_unit_id");--> statement-breakpoint
CREATE INDEX "sales_orders_buyer_idx" ON "sales_orders" USING btree ("buyer_unit_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipment_items_shipment_idx" ON "shipment_items" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_trackings_carrier_tracking_unique" ON "shipment_trackings" USING btree ("carrier","tracking_no");--> statement-breakpoint
CREATE INDEX "shipment_trackings_shipment_idx" ON "shipment_trackings" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_shipper_idx" ON "shipments" USING btree ("shipper_unit_id");--> statement-breakpoint
CREATE INDEX "shipments_receiver_idx" ON "shipments" USING btree ("receiver_unit_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_item_idx" ON "stock" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_batch_idx" ON "stock" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_unit_item_idx" ON "stock_movements" USING btree ("unit_id","item_id");--> statement-breakpoint
CREATE INDEX "stock_movements_batch_idx" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_created_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_scope_unit_idx" ON "users" USING btree ("scope_unit_id");