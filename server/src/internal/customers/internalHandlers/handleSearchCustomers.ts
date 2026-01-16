import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusSearchService } from "../CusSearchService";

/**
 * POST /customers/all/search
 * Used by:
 * - vite/src/hooks/common/useShowDeployButton.tsx
 * - vite/src/views/command-bar/CommandBar.tsx
 * - vite/src/views/customers/hooks/useCusSearchQuery.tsx
 */
export const handleSearchCustomers = createRoute({
	body: z.object({
		search: z.string().optional(),
		page_size: z.number().optional().default(50),
		page: z.number().optional().default(1),
		last_item: z.any().optional(),
		filters: z.any().optional(),
	}),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { search, page_size, page, last_item, filters } = c.req.valid("json");

		const { data: customers, count } = await CusSearchService.search({
			db,
			orgId: org.id,
			env,
			search: search ?? "",
			filters,
			lastItem: last_item,
			pageNumber: page,
			pageSize: page_size,
		});

		return c.json({ customers, totalCount: Number(count) });
	},
});
