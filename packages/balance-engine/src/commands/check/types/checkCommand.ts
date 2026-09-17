import { z } from "zod/v4";
import { baseCommandSchema } from "../../../models/common/baseCommand.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

export const checkParamsSchema = z.object({
	featureId: nonEmptyStringSchema,
	requiredBalance: finiteNumberSchema,
	properties: propertiesSchema,
});

export const checkCommandSchema = baseCommandSchema
	.extend({ type: z.literal("check"), ...checkParamsSchema.shape })
	.strict();

export type CheckCommand = z.infer<typeof checkCommandSchema>;
