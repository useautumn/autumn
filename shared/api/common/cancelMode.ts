import { z } from "zod/v4";

/**
 * Mode for canceling a subscription via update subscription API
 */
export const CancelModeSchema = z.enum([
	"immediately",
	"end_of_cycle",
	"uncancel",
]);

export type CancelMode = z.infer<typeof CancelModeSchema>;
