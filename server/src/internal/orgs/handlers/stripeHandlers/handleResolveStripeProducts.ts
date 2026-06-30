import {
	type CatalogStripeProduct,
	Scopes,
	StripeProductResolveParamsSchema,
	StripeProductResolveResponseSchema,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { stripeProductToCatalogProduct } from "@/internal/catalog/actions/catalogMappings/catalogMappingUtils.js";
import { isStripeConnected } from "../../orgUtils.js";

// Stripe's list endpoint accepts up to 100 ids per request.
const STRIPE_IDS_PER_REQUEST = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

export const handleResolveStripeProducts = createRoute({
	scopes: [Scopes.Plans.Read],
	body: StripeProductResolveParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;
		const { stripe_product_ids } = c.req.valid("json");

		if (!isStripeConnected({ org, env })) {
			return c.json(
				StripeProductResolveResponseSchema.parse({
					stripe_connected: false,
					stripe_products: [],
				}),
			);
		}

		const ids = Array.from(new Set(stripe_product_ids.filter(Boolean)));
		if (ids.length === 0) {
			return c.json(
				StripeProductResolveResponseSchema.parse({
					stripe_connected: true,
					stripe_products: [],
				}),
			);
		}

		const stripeCli = createStripeCli({ org, env });
		const productsById = new Map<string, CatalogStripeProduct>();

		// Sequential chunks keep us well within Stripe's rate limits (1 call / 100 ids).
		for (const idsChunk of chunk(ids, STRIPE_IDS_PER_REQUEST)) {
			try {
				const listed = await stripeCli.products.list({
					ids: idsChunk,
					limit: STRIPE_IDS_PER_REQUEST,
				});
				for (const product of listed.data) {
					const catalogProduct = stripeProductToCatalogProduct(product);
					productsById.set(catalogProduct.id, catalogProduct);
				}
			} catch (error) {
				logger.warn(
					`[stripe.products.resolve] Failed to resolve products: ${error}`,
				);
			}
		}

		return c.json(
			StripeProductResolveResponseSchema.parse({
				stripe_connected: true,
				stripe_products: Array.from(productsById.values()),
			}),
		);
	},
});
