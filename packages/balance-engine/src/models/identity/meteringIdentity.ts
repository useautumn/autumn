import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const meteringIdentitySchema = z
	.object({
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		customerId: nonEmptyStringSchema,
		entityId: nonEmptyStringSchema.nullable(),
	})
	.loose();

export type MeteringIdentity = z.infer<typeof meteringIdentitySchema>;
