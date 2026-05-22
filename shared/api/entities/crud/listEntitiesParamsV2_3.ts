import { z } from "zod/v4";
import {
	CursorRequestFieldSchema,
	createCursorLimitSchema,
	PaginationDefaults,
} from "../../common/cursorPaginationSchemas.js";

export const ListEntitiesV2_3ParamsSchema = z.object({
	start_cursor: CursorRequestFieldSchema,
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
				"Filter by plan ID and version. Returns entities with active subscriptions to this plan, including plans inherited from the parent customer.",
		}),

	subscription_status: z.enum(["active", "scheduled"]).optional().meta({
		description:
			"Filter customer products used for entity hydration and plan matching. Defaults to active and scheduled.",
	}),

	search: z.string().optional().meta({
		description: "Search entities by id or name.",
	}),

	processors: z
		.array(z.enum(["stripe", "revenuecat", "vercel"]))
		.optional()
		.meta({
			description:
				"Filter by parent customer processor type (stripe, revenuecat, vercel).",
		}),

	customer_id: z.string().trim().min(1).optional().meta({
		description:
			"Restrict the response to entities owned by this customer id. Use to bulk-fetch all entities for one customer in a single paginated call instead of iterating entities.get.",
	}),
});

export type ListEntitiesV2_3Params = z.infer<
	typeof ListEntitiesV2_3ParamsSchema
>;
