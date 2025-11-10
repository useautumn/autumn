import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { VercelBillingPlan } from "../../misc/vercelTypes.js";

export const handleGetInstallation = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { integrationConfigurationId } = c.req.param();
		const { db, org } = ctx;

		const customer = await CusService.getByVercelId({
			db,
			vercelInstallationId: integrationConfigurationId,
			orgId: org.id,
			env: ctx.env,
		});

		// const billingPlan = customer?.customer_products?.find((x) =>
		// 	isMainProduct({
		// 		product: {
		// 			...x.product,
		// 			prices: x.customer_prices.map((y) => y.price) ?? {},
		// 			entitlements: x.customer_entitlements.map((y) => y.entitlement) ?? [],
		// 		},
		// 		prices: x.customer_prices.map((y) => y.price) ?? [],
		// 	}),
		// );

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
				billingPlan: customer.customer_products?.[0]?.product
					? ({
							id: customer.customer_products?.[0]?.product.id ?? "",
							type: "subscription",
							name: customer.customer_products?.[0]?.product.name ?? "",
							scope: "installation",
							description: "",
						} satisfies VercelBillingPlan)
					: null,
			},
			200,
		);
	},
});
