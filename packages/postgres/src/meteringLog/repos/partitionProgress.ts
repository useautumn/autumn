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
	claim_token: z.string().nullable().optional(),
});

export type PartitionProgressRow = {
	nextOffset: bigint;
	commandNextOffset: bigint | null;
	/** The latest ownership fence in the partition's log, or null before any owner wrote one. */
	ownerFence: { epoch: bigint; offset: bigint } | null;
	/** The claim the partition's current owner stamped, or null before any owner claimed it. */
	claimToken: string | null;
};

export const readPartitionProgress = async ({
	ctx,
	topic,
	partition,
}: {
	ctx: ProgressContext;
} & PartitionPosition): Promise<PartitionProgressRow | null> => {
	const { rows } = await ctx.db.execute(sql`
		SELECT next_offset, command_next_offset, owner_epoch, owner_fence_offset, claim_token
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
		claimToken: parsed.data.claim_token ?? null,
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
	claimToken,
}: {
	ctx: ProgressContext;
	nextOffset: bigint;
	claimToken?: string;
} & PartitionPosition): Promise<void> => {
	await ctx.db.execute(sql`
		INSERT INTO partition_progress (topic, partition_id, next_offset, claim_token)
		VALUES (${topic}, ${partition}, ${nextOffset}, ${claimToken ?? null})
	`);
};

const CLAIM_EPOCH_DIGITS = 20;

export const epochClaimToken = ({
	ownerEpoch,
	id,
}: {
	ownerEpoch: bigint;
	id: string;
}): string =>
	`${ownerEpoch.toString().padStart(CLAIM_EPOCH_DIGITS, "0")}:${id}`;

export const claimPartitionProgress = async ({
	ctx,
	topic,
	partition,
	claimToken,
	ownerEpoch,
}: {
	ctx: ProgressContext;
	claimToken: string;
	ownerEpoch: bigint;
} & PartitionPosition): Promise<boolean> => {
	const { rows } = await ctx.db.execute(sql`
		WITH existing AS (
			SELECT 1 FROM partition_progress
			WHERE topic = ${topic} AND partition_id = ${partition}
		), updated AS (
			UPDATE partition_progress SET claim_token = ${claimToken}
			WHERE topic = ${topic} AND partition_id = ${partition}
				AND (
					claim_token IS NULL
					OR CASE
						WHEN claim_token ~ '^[0-9]{20}:'
						THEN substr(claim_token, 1, 20)::numeric <= ${ownerEpoch}::numeric
						ELSE true
					END
				)
				AND (owner_epoch IS NULL OR owner_epoch <= ${ownerEpoch}::bigint)
			RETURNING 1
		)
		SELECT (NOT EXISTS (SELECT 1 FROM existing) OR EXISTS (SELECT 1 FROM updated)) AS claimed
	`);
	return rows[0]?.claimed === true;
};
