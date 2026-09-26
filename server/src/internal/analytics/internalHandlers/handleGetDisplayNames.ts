import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCustomerNames } from "@/internal/analytics/actions/getCustomerNames.js";
import { getEntityNames } from "@/internal/analytics/actions/getEntityNames.js";
import { ProductService } from "@/internal/products/ProductService.js";

const MAX_IDS = 500;

const GetDisplayNamesSchema = z.object({
	customer_ids: z.array(z.string()).max(MAX_IDS).optional(),
	entity_ids: z.array(z.string()).max(MAX_IDS).optional(),
	include_plans: z.boolean().optional(),
});

/** Names for the customer, entity and plan ids a chart groups by. */
export const handleGetDisplayNames = createRoute({
	scopes: [Scopes.Analytics.Read],
	body: GetDisplayNamesSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_ids, entity_ids, include_plans } = c.req.valid("json");

		const [customerNames, entityNames, planNames] = await Promise.all([
			getCustomerNames({
				db,
				customerIds: customer_ids ?? [],
				orgId: org.id,
				env,
			}),
			getEntityNames({ db, entityIds: entity_ids ?? [], orgId: org.id, env }),
			include_plans
				? ProductService.listCachedAllVersions({ db, orgId: org.id, env }).then(
						(plans) =>
							Object.fromEntries(
								plans.map((plan) => [plan.id, plan.name ?? plan.id]),
							),
					)
				: undefined,
		]);

		return c.json({ customerNames, entityNames, planNames });
	},
});
