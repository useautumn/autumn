import { z } from "zod/v4";
import { createPaginationParamsSchema } from "../../common/pagePaginationSchemas";

export const ListCustomersV2ParamsSchema = createPaginationParamsSchema({
	defaultLimit: 10,
}).extend({
	plans: z
		.array(
			z.object({
				id: z.string(),
				versions: z.number().array().optional(),
			}),
		)
		.optional()
		.meta({
			description:
				"Filter by plan ID and version. Returns customers with active subscriptions to this plan.",
		}),

	subscription_status: z.enum(["active", "scheduled"]).optional().meta({
		description:
			"Filter by customer product status. Defaults to active and scheduled",
	}),

	search: z.string().optional().meta({
		description: "Search customers by id, name, or email",
	}),
});

export type ListCustomersV2Params = z.infer<typeof ListCustomersV2ParamsSchema>;
