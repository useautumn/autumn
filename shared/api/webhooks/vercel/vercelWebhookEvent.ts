import { z } from "zod/v4";

export const VercelWebhookEventSchema = z.object({
	installation_id: z.string().meta({
		description: "The Vercel integration configuration ID.",
	}),
	event: z.any().meta({
		description: "The raw Vercel webhook event payload.",
	}),
});
