DO $$ BEGIN
  CREATE TYPE "public"."min_sale_unit" AS ENUM('SPEC', 'INNER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TYPE "public"."spec_unit" ADD VALUE IF NOT EXISTS 'GRAIN' BEFORE 'OTHER';--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "min_sale_unit" "public"."min_sale_unit" DEFAULT 'SPEC' NOT NULL;