import {
	type AppEnv,
	cusProductToProduct,
	type FullCusProduct,
	mapToProductV2,
	productV2ToBasePrice,
	Scopes,
} from "@autumn/shared";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { productToBillingPlan } from "../handleListBillingPlans.js";

/**
 * GET /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Get a single resource by ID
 */
export const handleGetResource = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const ctx = c.get("ctx");
		const { db, org, fullCustomer: customer } = ctx;

		const resource = await VercelResourceService.getByIdAndInstallation({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
		});

		const getPlanAmount = (cusProduct: FullCusProduct) => {
			const product = cusProductToProduct({ cusProduct });
			const productV2 = mapToProductV2({ product });
			const basePrice = productV2ToBasePrice({ product: productV2 });
			return basePrice?.price ?? 0;
		};

		const nonAddonProducts = (customer?.customer_products || []).filter(
			(cp) => !cp.product.is_add_on,
		);

		const customerProduct =
			nonAddonProducts.sort((a, b) => getPlanAmount(b) - getPlanAmount(a))[0] ??
			customer?.customer_products?.[0];

		const billingPlan =
			customerProduct !== undefined
				? productToBillingPlan({
						product: cusProductToProduct({ cusProduct: customerProduct }),
						orgCurrency: org?.default_currency ?? "usd",
					})
				: undefined;

		return c.json({
			id: resource.id,
			productId: resource.org_id,
			name: resource.name,
			metadata: resource.metadata,
			status: resource.status,
			...(billingPlan ? { billingPlan } : {}),
			notification: null,
		});
	},
});
