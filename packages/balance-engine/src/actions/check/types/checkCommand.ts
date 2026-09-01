import { z } from "zod/v4";
import { propertiesSchema } from "../../../common/types/jsonValue.js";
import { meteringIdentitySchema } from "../../../common/types/meteringIdentity.js";
import { nonEmptyStringSchema } from "../../../common/types/schemaUtils.js";

export const checkCommandSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("check"),
		requestId: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		entityId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		requiredBalance: z.number(),
		properties: propertiesSchema,
		occurredAt: z.number().int().nonnegative(),
	})
	.strict();

export type CheckCommand = z.infer<typeof checkCommandSchema>;
