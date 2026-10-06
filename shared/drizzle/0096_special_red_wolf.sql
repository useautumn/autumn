CREATE TABLE "subject_snapshots" (
	"org_id" text COLLATE "C" NOT NULL,
	"env" text COLLATE "C" NOT NULL,
	"customer_id" text COLLATE "C" NOT NULL,
	"entity_id" text COLLATE "C" NOT NULL,
	"internal_customer_id" text COLLATE "C" NOT NULL,
	"internal_entity_id" text COLLATE "C",
	"partition" integer NOT NULL,
	"partition_count" integer NOT NULL,
	"state_version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"baseline_at" bigint NOT NULL,
	"written_at" bigint NOT NULL,
	"log_offset" bigint,
	CONSTRAINT "subject_snapshots_pkey" PRIMARY KEY("org_id","env","customer_id","entity_id")
) WITH (fillfactor = 80);
--> statement-breakpoint
ALTER TABLE "subject_snapshots" ADD CONSTRAINT "subject_snapshots_internal_customer_id_fkey" FOREIGN KEY ("internal_customer_id") REFERENCES "public"."customers"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_snapshots" ADD CONSTRAINT "subject_snapshots_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "public"."entities"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subject_snapshots_partition" ON "subject_snapshots" USING btree ("partition","partition_count");--> statement-breakpoint
CREATE INDEX "idx_subject_snapshots_internal_customer_id" ON "subject_snapshots" USING btree ("internal_customer_id");--> statement-breakpoint
CREATE INDEX "idx_subject_snapshots_internal_entity_id" ON "subject_snapshots" USING btree ("internal_entity_id") WHERE "subject_snapshots"."internal_entity_id" IS NOT NULL;