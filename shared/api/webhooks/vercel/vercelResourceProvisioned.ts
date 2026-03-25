import { z } from "zod/v4";

export const VercelResourceProvisionedSchema = z.object({
	resource: z
		.object({
			id: z.string().meta({
				description: "The unique identifier of the provisioned resource.",
			}),
			name: z.string().meta({
				description: "The display name of the provisioned resource.",
			}),
		})
		.meta({ description: "The resource that was provisioned." }),
	installation_id: z.string().meta({
		description: "The Vercel integration configuration ID.",
	}),
	access_token: z.string().meta({
		description:
			"An access token that can be used to patch the resource's secrets.",
	}),
});
