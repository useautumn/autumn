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
	})
	.strict();

export const ownershipRecordSchema = z.discriminatedUnion("type", [
	claimedOwnershipRecordSchema,
	unownedOwnershipRecordSchema,
]);

export type OwnershipRecord = z.infer<typeof ownershipRecordSchema>;
