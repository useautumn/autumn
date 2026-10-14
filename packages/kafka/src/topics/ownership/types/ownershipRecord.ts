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
		endpoint: nonEmptyStringSchema.optional(),
	})
	.loose();

export const releasedOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("released"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		releasedAt: z.number().int().nonnegative(),
	})
	.loose();

export const readyOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("ready"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		readyAt: z.number().int().nonnegative(),
	})
	.loose();

export const drainingOwnershipRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("draining"),
		partition: partitionSchema,
		endpoint: nonEmptyStringSchema,
		successor: nonEmptyStringSchema,
		drainingAt: z.number().int().nonnegative(),
	})
	.loose();

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
