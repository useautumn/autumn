ALTER TABLE "partition_progress" ADD COLUMN "owner_epoch" bigint;--> statement-breakpoint
ALTER TABLE "partition_progress" ADD COLUMN "owner_fence_offset" bigint;