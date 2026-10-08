CREATE TABLE "qa_envs" (
	"name" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"sha" text NOT NULL,
	"url" text NOT NULL,
	"state" text DEFAULT 'building' NOT NULL,
	"parent_branch" text NOT NULL,
	"neon_branch_id" text,
	"sealed_secrets" text NOT NULL,
	"last_job_id" text,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "qa_envs_expires_idx" ON "qa_envs" USING btree ("expires_at");