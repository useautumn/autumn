import {
	type CatalogGetMappingsParams,
	type CatalogGetMappingsResponse,
	CatalogGetMappingsResponseSchema,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { buildPlanMappings } from "./getMappings/buildPlanMappings.js";
import { loadCatalogMappingProducts } from "./getMappings/loadCatalogMappingProducts.js";

// Stripe product names/status are resolved lazily by the client via
// /stripe/products/resolve, so this endpoint never calls Stripe.
export const getCatalogMappings = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogGetMappingsParams;
}): Promise<CatalogGetMappingsResponse> => {
	const { org, env, features } = ctx;
	const { latestProducts, allProducts } = await loadCatalogMappingProducts({
		ctx,
	});

	return CatalogGetMappingsResponseSchema.parse({
		processor_type: params.processor_type,
		stripe_connected: isStripeConnected({ org, env }),
		stripe_products: [],
		plan_mappings: buildPlanMappings({
			latestProducts,
			allProducts,
			features,
			currency: org.default_currency || "usd",
			stripeProductsById: new Map(),
			stripeConnected: false,
			deferred: true,
		}),
	});
};
