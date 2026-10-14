import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";
import { workerLockSchema } from "../../../models/subject/rows/workerLock.js";

export const finalizeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("finalize"),
		org: commandOrgSchema,
		lock: workerLockSchema,
		internalFeatureId: nonEmptyStringSchema,
		finalValue: finiteNumberSchema.nullable(),
		properties: propertiesSchema,
	})
	.loose();

export type FinalizeCommand = z.infer<typeof finalizeCommandSchema>;
