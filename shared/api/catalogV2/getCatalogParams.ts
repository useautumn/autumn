import { z } from "zod/v4";

export const GetCatalogParamsSchema = z
	.object({
		include_archived: z.boolean().optional().meta({
			description: "If true, includes archived plans in the response.",
		}),
		include_versions: z.boolean().optional().meta({
			description:
				"Return every non-archived version of each plan, not only the active one. Rows carry active, version and version_slug.",
		}),
	})
	.optional();

export type GetCatalogParams = z.infer<typeof GetCatalogParamsSchema>;
