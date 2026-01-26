import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";

export const TrackResponseV3Schema = z.object({
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
	balance: ApiBalanceV1Schema.nullable(),
	balances: z.record(z.string(), ApiBalanceV1Schema).optional(),
});

export type TrackResponseV3 = z.infer<typeof TrackResponseV3Schema>;
