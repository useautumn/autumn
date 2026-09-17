import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { commandOrgSchema } from "../../../models/command/commandOrg.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

export const overageBehaviorSchema = z.enum(["cap", "reject", "overflow"]);

export type OverageBehavior = z.infer<typeof overageBehaviorSchema>;

export const trackCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("track"),
		org: commandOrgSchema,
		featureId: nonEmptyStringSchema,
		/** The feature's catalog internal id; credit usage is attributed under it. */
		internalFeatureId: nonEmptyStringSchema,
		value: finiteNumberSchema.refine((value) => value !== 0),
		overageBehavior: overageBehaviorSchema,
		properties: propertiesSchema,
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;
