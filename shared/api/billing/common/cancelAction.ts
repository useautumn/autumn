import { z } from "zod/v4";

export const CancelActionSchema = z
	.enum(["cancel_immediately", "cancel_end_of_cycle", "uncancel"])
	.meta({
		title: "CancelAction",
		description:
			"Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.",
	});

export type CancelAction = z.infer<typeof CancelActionSchema>;
