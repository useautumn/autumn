import {
	bigint,
	integer,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

export const partitionProgress = pgTable(
	"partition_progress",
	{
		topic: text("topic").notNull(),
		partition_id: integer("partition_id").notNull(),
		next_offset: bigint("next_offset", { mode: "bigint" }).notNull(),
		command_next_offset: bigint("command_next_offset", { mode: "bigint" }),
		owner_epoch: bigint("owner_epoch", { mode: "bigint" }),
		owner_fence_offset: bigint("owner_fence_offset", { mode: "bigint" }),
		claim_token: text("claim_token"),
	},
	(table) => [
		primaryKey({
			columns: [table.topic, table.partition_id],
			name: "partition_progress_pkey",
		}),
	],
);

export type PartitionProgress = typeof partitionProgress.$inferSelect;
