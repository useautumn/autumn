import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./schemaUtils.js";

export const meteringIdentitySchema = z
	.object({
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		customerId: nonEmptyStringSchema,
	})
	.strict();

export type MeteringIdentity = z.infer<typeof meteringIdentitySchema>;
