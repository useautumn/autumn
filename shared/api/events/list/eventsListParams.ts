import { z } from "zod/v4";
import { PagePaginationQuerySchema } from "../../common/pagePaginationSchemas";

export const ApiEventsListParamsSchema = PagePaginationQuerySchema.extend({
	customer_id: z.string().describe("Filter events by customer ID"),
	feature_id: z
		.string()
		.min(1)
		.or(z.array(z.string().min(1)))
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
});

export type ApiEventsListParams = z.infer<typeof ApiEventsListParamsSchema>;
