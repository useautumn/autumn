import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { RowsInvalidError } from "../../common/parseRows.js";
import type { PostgresExecutor } from "../../types/postgresClient.js";

type ProgressContext = { db: PostgresExecutor };
type PartitionPosition = { topic: string; partition: number };

// int8 arrives as a string, number or bigint depending on the driver path; the boundary normalises it.
const nextOffsetSchema = z
	.union([
		z.bigint(),
		z.number().int().nonnegative(),
		z.string().regex(/^\d+$/),
	])
	.transform((value) => BigInt(value));

export const readNextOffset = async ({
	ctx,
	topic,
	partition,
}: { ctx: ProgressContext } & PartitionPosition): Promise<bigint | null> => {
	const rows = await ctx.db.execute(sql`
		SELECT next_offset
		FROM partition_progress
		WHERE topic = ${topic} AND partition_id = ${partition}
	`);
	const row = rows[0];
	if (!row) return null;
	const parsed = nextOffsetSchema.safeParse(row.next_offset);
	if (!parsed.success) {
		throw new RowsInvalidError({
			table: "partition_progress",
			issues: parsed.error.issues,
		});
	}
	return parsed.data;
};

export const insertPartitionProgress = async ({
	ctx,
	topic,
	partition,
	nextOffset,
}: {
	ctx: ProgressContext;
	nextOffset: bigint;
} & PartitionPosition): Promise<void> => {
	await ctx.db.execute(sql`
		INSERT INTO partition_progress (topic, partition_id, next_offset)
		VALUES (${topic}, ${partition}, ${nextOffset})
	`);
};
