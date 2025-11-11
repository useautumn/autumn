import { z } from "zod/v4";
export const TrackResponseV0Schema = z.object({
	success: z.boolean().meta({
		description: "Whether the track was successful",
	}),
});

export const TrackResponseV1Schema = z.object({
	id: z.string().meta({
		description: "The ID of the created event",
	}),
	code: z.string().meta({
		description: "Response code",
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
});

export type TrackResponseV1 = z.infer<typeof TrackResponseV1Schema>;
