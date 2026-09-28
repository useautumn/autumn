import {
	bigint,
	integer,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

/** The balance worker's bookmarks: everything below next_offset is in Postgres, everything below command_next_offset is decided, and records above owner_fence_offset from an epoch below owner_epoch are a stale owner's. */
export const partitionProgress = pgTable(
	"partition_progress",
	{
		topic: text("topic").notNull(),
		partition_id: integer("partition_id").notNull(),
		next_offset: bigint("next_offset", { mode: "bigint" }).notNull(),
		/** How far the partition's queued commands are decided; null until one has been. */
		command_next_offset: bigint("command_next_offset", { mode: "bigint" }),
		/** The ownership epoch of the latest fence marker the partition's log carried; null before any. */
		owner_epoch: bigint("owner_epoch", { mode: "bigint" }),
		/** Where that fence sits in the log; records above it from a lower epoch are dropped. */
		owner_fence_offset: bigint("owner_fence_offset", { mode: "bigint" }),
	},
	(table) => [
		primaryKey({
			columns: [table.topic, table.partition_id],
			name: "partition_progress_pkey",
		}),
	],
);

export type PartitionProgress = typeof partitionProgress.$inferSelect;
