import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./common/primitives.js";

/** orgId, env and customerId name the customer's log; entityId only says which view of it a command reads. */
export const meteringIdentitySchema = z
	.object({
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		customerId: nonEmptyStringSchema,
		entityId: nonEmptyStringSchema.nullable(),
	})
	.strict();

export type MeteringIdentity = z.infer<typeof meteringIdentitySchema>;
