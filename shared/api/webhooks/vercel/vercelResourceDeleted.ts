import { z } from "zod/v4";

export const VercelResourceDeletedSchema = z.object({
	resource: z
		.object({
			id: z.string().meta({
				description: "The unique identifier of the deleted resource.",
			}),
		})
		.meta({ description: "The resource that was deleted." }),
	installation_id: z.string().meta({
		description: "The Vercel integration configuration ID.",
	}),
});
