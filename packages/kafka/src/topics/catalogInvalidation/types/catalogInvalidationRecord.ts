import { z } from "zod/v4";

const nonEmptyStringSchema = z.string().min(1);

/** One org's catalog changed in one env: every cached row of it is stale from `at`. */
export const catalogInvalidationRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("invalidated"),
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		at: z.number().int().nonnegative(),
	})
	.strict();

export type CatalogInvalidationRecord = z.infer<
	typeof catalogInvalidationRecordSchema
>;
