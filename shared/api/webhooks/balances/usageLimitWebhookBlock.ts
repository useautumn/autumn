import { z } from "zod/v4";
import {
	USAGE_LIMIT_INTERVALS,
	UsageLimitAnchorSchema,
} from "../../../models/cusModels/billingControls/usageLimit.js";

/** The usage limit a balances webhook measured against, with its live window. */
export const UsageLimitWebhookBlockSchema = z.object({
	limit: z
		.number()
		.meta({ description: "Maximum units allowed per interval." }),
	interval: z.enum(USAGE_LIMIT_INTERVALS).meta({
		description: "Interval of the cap.",
	}),
	anchor: UsageLimitAnchorSchema.meta({
		description: "Window alignment the cap was configured with.",
	}),
	usage: z.number().meta({
		description: "Units consumed in the current window, after this event.",
	}),
	remaining: z.number().meta({
		description: "Units left in the current window, never below zero.",
	}),
	window_start_at: z.number().meta({
		description: "Start of the current window, in milliseconds since epoch.",
	}),
	window_end_at: z.number().meta({
		description: "End of the current window, in milliseconds since epoch.",
	}),
});

export type UsageLimitWebhookBlock = z.infer<
	typeof UsageLimitWebhookBlockSchema
>;
