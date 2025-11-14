import { z } from "zod/v4";
export const TrackResponseV0Schema = z.object({
	success: z.boolean().meta({
		description: "Whether the track was successful",
	}),
});

export const TRACK_RESPONSE_V1_EXAMPLE = {
	customer_id: "customer_123",
	feature_id: "api_tokens",
};

export const TrackResponseV1Schema = z
	.object({
		id: z.string().meta({
			internal: true,
		}),
		code: z.string().meta({
			internal: true,
		}),
		customer_id: z.string().meta({
			description: "The ID of the customer",
		}),
		entity_id: z.string().optional().meta({
			description: "The ID of the entity (if provided)",
		}),
		event_name: z.string().optional().meta({
			description: "The name of the event",
		}),
		feature_id: z.string().optional().meta({
			description: "The ID of the feature (if provided)",
		}),
	})
	.meta({
		example: TRACK_RESPONSE_V1_EXAMPLE,
	});

export type TrackResponseV1 = z.infer<typeof TrackResponseV1Schema>;
