import type { Customer } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusBatchService } from "../CusBatchService";
import { CusSearchService } from "../CusSearchService";

/**
 * POST /customers/all/full_customers
 * Used by:
 * - vite/src/views/onboarding4/hooks/useOnboardingProgress.tsx
 * - vite/src/views/customers/hooks/useFullCusSearchQuery.tsx
 */
export const handleGetFullCustomers = createRoute({
	body: z.object({
		search: z.string().optional(),
		page_size: z.number().optional().default(50),
		page: z.number().optional().default(1),
		last_item: z.any().optional(),
		filters: z.any().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { search, page_size, page, last_item, filters } = c.req.valid("json");

		const { org, env, db } = ctx;

		const { data: customers } = await CusSearchService.search({
			db,
			orgId: org.id,
			env,
			search: search || "",
			filters,
			lastItem: last_item,
			pageNumber: page,
			pageSize: page_size,
		});

		const fullCustomers = await CusBatchService.getByInternalIds({
			ctx,
			internalCustomerIds: customers.map(
				(customer: Customer) => customer.internal_id,
			),
		});

		return c.json({ fullCustomers });
	},
});
