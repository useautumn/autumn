import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";

/**
 * Track response V3 - uses ApiBalanceV1 (V2.1 format)
 * This is the server's internal response format
 */
export const TrackResponseV3Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer whose usage was tracked.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity, if entity-scoped tracking was performed.",
	}),
	event_name: z.string().optional().meta({
		description: "The event name that was tracked, if event_name was used instead of feature_id.",
	}),

	value: z.number().meta({
		description: "The amount of usage that was recorded.",
	}),
	balance: ApiBalanceV1Schema.nullable().meta({
		description:
			"The updated balance for the tracked feature. Null if tracking by event_name that affects multiple features.",
	}),
	balances: z.record(z.string(), ApiBalanceV1Schema).optional().meta({
		description:
			"Map of feature_id to updated balance when tracking by event_name affects multiple features.",
	}),
});

export type TrackResponseV3 = z.infer<typeof TrackResponseV3Schema>;
