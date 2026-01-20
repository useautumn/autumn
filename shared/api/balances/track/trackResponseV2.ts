import { z } from "zod/v4";
import { ApiBalanceV0Schema } from "../../customers/cusFeatures/previousVersions/apiBalanceV0.js";

export const TrackResponseV2Schema = z.object({
	// id: z.string().meta({
	// 	description: "The ID of the created event",
	// }),
	// code: z.string().meta({
	// 	description: "Response code",
	// }),
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity (if provided)",
	}),
	event_name: z.string().optional().meta({
		description: "The name of the event",
	}),

	value: z.number(),
	balance: ApiBalanceV0Schema.nullable(),
	balances: z.record(z.string(), ApiBalanceV0Schema).optional(),

	// feature_id: z.string().optional().meta({
	// 	description: "The ID of the feature (if provided)",
	// }),
});

export type TrackResponseV2 = z.infer<typeof TrackResponseV2Schema>;
