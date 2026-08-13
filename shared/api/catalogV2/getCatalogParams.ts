import { z } from "zod/v4";

export const GetCatalogParamsSchema = z
	.object({
		include_archived: z.boolean().optional().meta({
			description: "If true, includes archived plans in the response.",
		}),
	})
	.optional();

export type GetCatalogParams = z.infer<typeof GetCatalogParamsSchema>;
