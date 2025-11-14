import { z } from "zod/v4";
import { ApiBalanceSchema } from "../../customers/cusFeatures/apiBalance.js";

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
	balance: ApiBalanceSchema.nullable(),
	balances: z.record(z.string(), ApiBalanceSchema).optional(),

	// feature_id: z.string().optional().meta({
	// 	description: "The ID of the feature (if provided)",
	// }),
});

export type TrackResponseV2 = z.infer<typeof TrackResponseV2Schema>;
