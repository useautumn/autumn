import { z } from "zod/v4";

export const AdvanceTestClockParamsSchema = z.object({
	customer_id: z.string().min(1).meta({
		description: "The ID of the customer whose Stripe test clock to advance.",
	}),
	frozen_time: z.number().int().nonnegative().meta({
		description:
			"Target time as a Unix timestamp in milliseconds. Rounded down to whole seconds; must be later than the current clock time.",
	}),
});

export const AdvanceTestClockResponseSchema = z.object({
	customer_id: z.string(),
	frozen_time: z.number().int().meta({
		description: "The Stripe test clock's frozen time in milliseconds.",
	}),
	status: z.enum(["advancing", "internal_failure", "ready"]),
});

export type AdvanceTestClockParams = z.infer<
	typeof AdvanceTestClockParamsSchema
>;
export type AdvanceTestClockResponse = z.infer<
	typeof AdvanceTestClockResponseSchema
>;
