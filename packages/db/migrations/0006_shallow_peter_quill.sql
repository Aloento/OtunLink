ALTER TABLE "email_logs" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;