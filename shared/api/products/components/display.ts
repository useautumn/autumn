import { z } from "zod/v4";

export const DisplaySchema = z.object({
	primary_text: z.string().meta({
		description: "Main display text (e.g. '$10' or '100 messages').",
	}),
	secondary_text: z.string().optional().meta({
		description:
			"Secondary display text (e.g. 'per month' or 'then $0.5 per 100').",
	}),
});
