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

const progressRowSchema = z.object({
	next_offset: nextOffsetSchema,
	command_next_offset: nextOffsetSchema.nullable(),
	owner_epoch: nextOffsetSchema.nullable().optional(),
	owner_fence_offset: nextOffsetSchema.nullable().optional(),
});

export type PartitionProgressRow = {
	nextOffset: bigint;
	commandNextOffset: bigint | null;
	/** The latest ownership fence in the partition's log, or null before any owner wrote one. */
	ownerFence: { epoch: bigint; offset: bigint } | null;
};

export const readPartitionProgress = async ({
	ctx,
	topic,
	partition,
}: {
	ctx: ProgressContext;
} & PartitionPosition): Promise<PartitionProgressRow | null> => {
	const rows = await ctx.db.execute(sql`
		SELECT next_offset, command_next_offset, owner_epoch, owner_fence_offset
		FROM partition_progress
		WHERE topic = ${topic} AND partition_id = ${partition}
	`);
	const row = rows[0];
	if (!row) return null;
	const parsed = progressRowSchema.safeParse(row);
	if (!parsed.success) {
		throw new RowsInvalidError({
			table: "partition_progress",
			issues: parsed.error.issues,
		});
	}
	const { owner_epoch, owner_fence_offset } = parsed.data;
	return {
		nextOffset: parsed.data.next_offset,
		commandNextOffset: parsed.data.command_next_offset,
		ownerFence:
			owner_epoch === null ||
			owner_epoch === undefined ||
			owner_fence_offset === null ||
			owner_fence_offset === undefined
				? null
				: { epoch: owner_epoch, offset: owner_fence_offset },
	};
};

export const readNextOffset = async (
	params: { ctx: ProgressContext } & PartitionPosition,
): Promise<bigint | null> =>
	(await readPartitionProgress(params))?.nextOffset ?? null;

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
