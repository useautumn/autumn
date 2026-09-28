import { z } from "zod/v4";

const nonEmptyStringSchema = z.string().min(1);
const partitionSchema = z.number().int().nonnegative();

export const claimedOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("claimed"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		claimedAt: z.number().int().nonnegative(),
	})
	.strict();

export const unownedOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("unowned"),
		partition: partitionSchema,
		releasedAt: z.number().int().nonnegative(),
		/** Who is giving the partition up. A release is only honoured when it names
		 *  the worker that currently holds the partition, so a worker letting go of
		 *  a claim it has already lost cannot evict whoever took it over. Optional
		 *  because releases written before this field existed carry no claimant and
		 *  are still applied unconditionally, the way they always were. */
		endpoint: nonEmptyStringSchema.optional(),
	})
	.strict();

/** A successor has prepared the partition and can take it; the owner table ignores it. */
export const readyOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("ready"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		readyAt: z.number().int().nonnegative(),
	})
	.strict();

export const ownershipRecordSchema = z.discriminatedUnion("type", [
	claimedOwnershipRecordSchema,
	unownedOwnershipRecordSchema,
	readyOwnershipRecordSchema,
]);

export type OwnershipRecord = z.infer<typeof ownershipRecordSchema>;
