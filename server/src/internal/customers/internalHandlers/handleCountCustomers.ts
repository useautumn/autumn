import {
	CustomerListFiltersSchema,
	findFeatureById,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusSearchService } from "../CusSearchService";
import { countCustomersByBalanceFilter } from "../resolveByBalanceFilter";

export const handleCountCustomers = createRoute({
	scopes: [Scopes.Customers.Read],
	body: z.object({
		search: z.string().optional(),
		filters: CustomerListFiltersSchema.optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { search, filters } = c.req.valid("json");

		if (filters?.balance) {
			const feature = findFeatureById({
				features: ctx.features,
				featureId: filters.balance.feature_id,
				errorOnNotFound: true,
			});
			const counted = await countCustomersByBalanceFilter({
				db,
				orgId: org.id,
				env,
				search: search ?? "",
				filters,
				balance: filters.balance,
				internalFeatureId: feature.internal_id,
			});
			// Null = lake unavailable: no affordable count exists, and the plain
			// count would ignore the balance filter entirely — report none instead.
			return c.json({
				totalCount: counted?.totalCount ?? null,
				approximate: counted?.approximate ?? false,
			});
		}

		const { totalCount } = await CusSearchService.count({
			db,
			orgId: org.id,
			env,
			search: search ?? "",
			filters,
		});

		return c.json({ totalCount, approximate: false });
	},
});
