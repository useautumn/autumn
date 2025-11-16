import { cusProductToProduct } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { VercelBillingPlan } from "../../misc/vercelTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

export const handleGetInstallation = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { integrationConfigurationId } = c.req.param();
		const { db, org, logger } = ctx;

		const customer = await CusService.getByVercelId({
			db,
			vercelInstallationId: integrationConfigurationId,
			orgId: org.id,
			env: ctx.env,
		});

		if (!customer) {
			return c.json(
				{
					error: "Customer not found",
				},
				404,
			);
		}

		return c.json(
			{
				notification: null,
				billingPlan:
					// edge case: [0] = add-on [1] = main
					customer.customer_products?.[0] !== undefined
						? (productToBillingPlan({
								product: cusProductToProduct({
									cusProduct: customer.customer_products?.[0],
								}),
								orgCurrency: org?.default_currency ?? "usd",
							}) satisfies VercelBillingPlan)
						: null,
			},
			200,
		);
	},
});
