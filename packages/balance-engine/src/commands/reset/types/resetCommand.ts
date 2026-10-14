import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandDurabilitySchema } from "../../../models/command/commandDurability.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const resetCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("reset"),
		org: commandOrgSchema,
		billingCycleAnchors: z
			.record(nonEmptyStringSchema, timestampSchema)
			.optional(),
		pooledGranted: z
			.record(nonEmptyStringSchema, finiteNumberSchema)
			.optional(),
		durability: commandDurabilitySchema.optional(),
	})
	.loose();

export type ResetCommand = z.infer<typeof resetCommandSchema>;
