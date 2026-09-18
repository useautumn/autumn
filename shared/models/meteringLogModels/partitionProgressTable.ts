import { bigint, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/** The balance worker's bookmark into the metering log: everything below next_offset is in Postgres. */
export const partitionProgress = pgTable(
	"partition_progress",
	{
		topic: text("topic").notNull(),
		partition_id: integer("partition_id").notNull(),
		next_offset: bigint("next_offset", { mode: "bigint" }).notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.topic, table.partition_id],
			name: "partition_progress_pkey",
		}),
	],
);

export type PartitionProgress = typeof partitionProgress.$inferSelect;
