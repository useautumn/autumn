CREATE TABLE "partition_progress" (
	"topic" text NOT NULL,
	"partition_id" integer NOT NULL,
	"next_offset" bigint NOT NULL,
	CONSTRAINT "partition_progress_pkey" PRIMARY KEY("topic","partition_id")
);
