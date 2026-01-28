import { z } from "zod/v4";

/**
 * Action for canceling a subscription via update subscription API
 */
export const CancelActionSchema = z.enum([
	"cancel_immediately",
	"cancel_end_of_cycle",
	"uncancel",
]);

export type CancelAction = z.infer<typeof CancelActionSchema>;
