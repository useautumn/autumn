import { z } from "zod/v4";

const nonEmptyStringSchema = z.string().min(1);

export const catalogInvalidationRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("invalidated"),
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		at: z.number().int().nonnegative(),
	})
	.loose();

export type CatalogInvalidationRecord = z.infer<
	typeof catalogInvalidationRecordSchema
>;
