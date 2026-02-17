import {
	cusProductToProduct,
	mapToProductV2,
	type FullCusProduct,
	productV2ToBasePrice,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { VercelBillingPlan } from "../../misc/vercelTypes.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

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

		if (!customer) {
			return c.json(
				{
					error: "Customer not found",
				},
				404,
			);
		}

		const getPlanAmount = (cusProduct: FullCusProduct) => {
			const product = cusProductToProduct({ cusProduct });
			const productV2 = mapToProductV2({ product });
			const basePrice = productV2ToBasePrice({ product: productV2 });
			return basePrice?.price ?? 0;
		};

		const nonAddonProducts = (customer.customer_products || []).filter(
			(customerProduct) => !customerProduct.product.is_add_on,
		);

		const customerProduct =
			nonAddonProducts.sort((a, b) => getPlanAmount(b) - getPlanAmount(a))[0] ??
			customer.customer_products?.[0];

		return c.json(
			{
				notification: null,
				billingPlan:
					customerProduct !== undefined
						? (productToBillingPlan({
								product: cusProductToProduct({
									cusProduct: customerProduct,
								}),
								orgCurrency: org?.default_currency ?? "usd",
							}) satisfies VercelBillingPlan)
						: null,
			},
			200,
		);
	},
});
