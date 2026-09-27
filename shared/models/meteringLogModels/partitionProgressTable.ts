import { bigint, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/** The balance worker's bookmarks: everything below next_offset is in Postgres, everything below command_next_offset is decided. */
export const partitionProgress = pgTable(
	"partition_progress",
	{
		topic: text("topic").notNull(),
		partition_id: integer("partition_id").notNull(),
		next_offset: bigint("next_offset", { mode: "bigint" }).notNull(),
		/** How far the partition's queued commands are decided; null until one has been. */
		command_next_offset: bigint("command_next_offset", { mode: "bigint" }),
	},
	(table) => [
		primaryKey({
			columns: [table.topic, table.partition_id],
			name: "partition_progress_pkey",
		}),
	],
);

export type PartitionProgress = typeof partitionProgress.$inferSelect;
