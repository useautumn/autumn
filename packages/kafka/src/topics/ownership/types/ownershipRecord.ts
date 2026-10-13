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
	.loose();

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
	.loose();

/** A worker giving up a partition, honoured only when it names the current holder. */
export const releasedOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("released"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		releasedAt: z.number().int().nonnegative(),
	})
	.loose();

/** A successor has prepared the partition and can take it; the owner table ignores it. */
export const readyOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("ready"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		readyAt: z.number().int().nonnegative(),
	})
	.loose();

/** The owner has withdrawn and is draining for the successor named by `ready`;
 *  the successor holds its claim timeout while the owner is alive and working.
 *  The owner table ignores it. */
export const drainingOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("draining"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		/** The worker this drain hands to; any other successor keeps its own timeout. */
		successor: nonEmptyStringSchema,
		drainingAt: z.number().int().nonnegative(),
	})
	.loose();

/** A successor assigned the partition has started preparing it and will announce `ready`;
 *  the owner keeps serving and holds its handoff wait instead of releasing at its timeout.
 *  The owner table ignores it. */
export const preparingOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("preparing"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		preparingAt: z.number().int().nonnegative(),
	})
	.loose();

export const ownershipRecordSchema = z.discriminatedUnion("type", [
	claimedOwnershipRecordSchema,
	unownedOwnershipRecordSchema,
	releasedOwnershipRecordSchema,
	readyOwnershipRecordSchema,
	drainingOwnershipRecordSchema,
	preparingOwnershipRecordSchema,
]);

export type OwnershipRecord = z.infer<typeof ownershipRecordSchema>;
