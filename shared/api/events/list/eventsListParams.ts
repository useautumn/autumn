import { z } from "zod/v4";
import { createPaginationParamsSchema } from "../../common/pagePaginationSchemas";

export const ApiEventsListParamsSchema = createPaginationParamsSchema({
	defaultLimit: 100,
}).extend({
	customer_id: z.string().optional().describe("Filter events by customer ID"),
	entity_id: z
		.string()
		.min(1)
		.optional()
		.describe("Filter events by entity ID (e.g., per-seat or per-resource)"),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
		.optional()
		.describe("Filter by specific feature ID(s)"),

	custom_range: z
		.object({
			start: z.coerce
				.number()
				.optional()
				.describe("Filter events after this timestamp (epoch milliseconds)"),
			end: z.coerce
				.number()
				.optional()
				.describe("Filter events before this timestamp (epoch milliseconds)"),
		})
		.optional()
		.describe("Filter events by time range"),
	filter_by: z
		.record(z.string(), z.string())
		.refine((val) => Object.keys(val).length <= 5, {
			message: "filter_by supports a maximum of 5 filters",
		})
		.optional()
		.meta({
			description:
				'Filter events by property values, e.g. {"model": "gpt-4", "region": "us"}. Maximum 5 filters.',
		}),
});

export type ApiEventsListParams = z.infer<typeof ApiEventsListParamsSchema>;
