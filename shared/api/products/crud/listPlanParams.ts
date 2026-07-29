import { z } from "zod/v4";

export const ListPlanParamsSchema = z
	.object({
		customer_id: z
			.string()
			.optional()
			.meta({
				description:
					"Customer ID to include eligibility info (trial availability, attach scenario).",
			}),
		entity_id: z
			.string()
			.optional()
			.meta({ description: "Entity ID for entity-scoped plans." }),
		include_archived: z
			.boolean()
			.optional()
			.meta({ description: "If true, includes archived plans in the response." }),
		all_versions: z
			.boolean()
			.optional()
			.meta({ description: "If true, includes all plan versions." }),
	})
	.optional();

export const ListPlansQuerySchema = z.object({
	customer_id: z
		.string()
		.optional()
		.meta({
			description:
				"Customer ID to include eligibility info (trial availability, attach scenario).",
		}),
	entity_id: z.string().optional().meta({
		description: "Entity ID for entity-scoped plans.",
		internal: true,
	}),
	include_archived: z.boolean().optional().meta({
		description: "If true, includes archived plans in the response.",
		internal: true,
	}),
	all_versions: z.boolean().optional().meta({
		description: "If true, includes all plan versions.",
		internal: true,
	}),
	v1_schema: z.boolean().optional().meta({
		internal: true,
	}),
});

export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>;
