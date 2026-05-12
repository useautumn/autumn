import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";

export const TrackMutationSchema = z.object({
	balance_id: z.string().meta({
		description:
			"ID of the underlying balance row that was mutated (customer_entitlement or rollover).",
	}),
	feature_id: z.string().meta({
		description: "The feature this balance belongs to.",
	}),
	value: z.number().meta({
		description:
			"Amount consumed from this balance. Positive when usage was deducted, negative when credit was restored (e.g. a negative track value).",
	}),
});

export type TrackMutation = z.infer<typeof TrackMutationSchema>;

/**
 * Track response V3 - uses ApiBalanceV1 (V2.1 format)
 * This is the server's internal response format
 */
export const TrackResponseV3Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer whose usage was tracked.",
	}),
	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity, if entity-scoped tracking was performed.",
	}),
	event_name: z.string().optional().meta({
		description:
			"The event name that was tracked, if event_name was used instead of feature_id.",
	}),

	value: z.number().meta({
		description: "The amount of usage that was recorded.",
	}),
	balance: ApiBalanceV1Schema.nullable().meta({
		description:
			"The updated balance for the tracked feature. Null if tracking by event_name that affects multiple features.",
	}),
	balances: z
		.record(z.string(), ApiBalanceV1Schema.nullable())
		.optional()
		.meta({
			description:
				"Map of feature_id to updated balance for the tracked feature and any related features (e.g. linked credit systems). Value is null when the customer has no balance for that feature.",
		}),
	mutations: z.array(TrackMutationSchema).optional().meta({
		description:
			"Per-balance breakdown of what this event deducted. A single event can consume from multiple balance rows when credit systems or rollovers are involved; this surfaces each one so callers can build per-feature usage views without polling.",
	}),
});

export type TrackResponseV3 = z.infer<typeof TrackResponseV3Schema>;
