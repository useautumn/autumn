import { z } from "zod/v4";

export const VercelResourceRotateSecretsSchema = z.object({
	resource: z
		.object({
			id: z.string().meta({
				description: "The unique identifier of the resource.",
			}),
		})
		.meta({ description: "The resource whose secrets should be rotated." }),
	installation_id: z.string().meta({
		description: "The Vercel integration configuration ID.",
	}),
	vercel_request_body: z.any().meta({
		description: "The raw request body from Vercel's rotation request.",
	}),
});
