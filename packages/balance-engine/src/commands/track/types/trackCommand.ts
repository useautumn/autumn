import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/common/baseCommand.js";
import { propertiesSchema } from "../../../models/common/json.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const overageBehaviorSchema = z.enum(["cap", "reject", "overflow"]);

export type OverageBehavior = z.infer<typeof overageBehaviorSchema>;

export const trackParamsSchema = z.object({
	featureId: nonEmptyStringSchema,
	value: finiteNumberSchema.refine((value) => value !== 0),
	overageBehavior: overageBehaviorSchema,
	properties: propertiesSchema,
});

export const trackCommandSchema = mutatingCommandSchema
	.extend({ type: z.literal("track"), ...trackParamsSchema.shape })
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;

/** What the log keeps of the command: trace fields plus params, never identity or id. */
export const trackCommandEchoSchema = z
	.object({
		type: z.literal("track"),
		requestId: nonEmptyStringSchema,
		occurredAt: timestampSchema,
		...trackParamsSchema.shape,
	})
	.strict();

export type TrackCommandEcho = z.infer<typeof trackCommandEchoSchema>;
