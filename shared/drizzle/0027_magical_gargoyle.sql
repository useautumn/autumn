ALTER TABLE "organizations" ADD COLUMN "is_sandbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sandbox_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sandbox_icon" text;