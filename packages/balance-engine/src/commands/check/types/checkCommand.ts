import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

export const checkParamsSchema = z.object({
	org: commandOrgSchema,
	featureId: nonEmptyStringSchema,
	/** The feature's catalog internal id; credit usage is attributed under it. */
	internalFeatureId: nonEmptyStringSchema,
	requiredBalance: finiteNumberSchema,
	properties: propertiesSchema,
});

export const checkCommandSchema = baseCommandSchema
	.extend({ type: z.literal("check"), ...checkParamsSchema.shape })
	.strict();

export type CheckCommand = z.infer<typeof checkCommandSchema>;
