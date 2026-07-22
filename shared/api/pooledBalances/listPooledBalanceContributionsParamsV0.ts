import { z } from "zod/v4";
import { createPaginationParamsSchema } from "../common/pagePaginationSchemas";

export const ListPooledBalanceContributionsParamsV0Schema =
	createPaginationParamsSchema({ defaultLimit: 10 }).extend({
		pooled_balance_id: z.string(),
		search: z.string().optional().meta({
			description: "Filters by entity name, entity id, or plan name.",
		}),
	});

export type ListPooledBalanceContributionsParamsV0 = z.infer<
	typeof ListPooledBalanceContributionsParamsV0Schema
>;
