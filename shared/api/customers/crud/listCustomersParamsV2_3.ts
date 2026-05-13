import { z } from "zod/v4";
import {
	createCursorLimitSchema,
	CursorRequestFieldSchema,
	PaginationDefaults,
} from "../../common/cursorPaginationSchemas.js";

export const ListCustomersV2_3ParamsSchema = z.object({
	cursor: CursorRequestFieldSchema,
	limit: createCursorLimitSchema({
		defaultLimit: PaginationDefaults.DefaultLimit,
	}),

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
			"Filter by customer product status. Defaults to active and scheduled.",
	}),

	search: z.string().optional().meta({
		description: "Search customers by id, name, or email.",
	}),

	processors: z
		.array(z.enum(["stripe", "revenuecat", "vercel"]))
		.optional()
		.meta({
			description:
				"Filter by customer processor type (stripe, revenuecat, vercel).",
		}),
});

export type ListCustomersV2_3Params = z.infer<
	typeof ListCustomersV2_3ParamsSchema
>;
