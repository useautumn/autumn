import {
	Scopes,
	StripeProductSearchParamsSchema,
	StripeProductSearchResponseSchema,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { stripeProductToCatalogProduct } from "@/internal/catalog/actions/catalogMappings/catalogMappingUtils.js";
import { isStripeConnected } from "../../orgUtils.js";

const STRIPE_PRODUCT_ID_PREFIX = "prod_";

const isStripeProductId = (search: string) =>
	search.trim().startsWith(STRIPE_PRODUCT_ID_PREFIX);

const escapeStripeSearchValue = (value: string) =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const shouldSearchByName = (search: string) =>
	search.length >= 3 && !isStripeProductId(search);

export const handleSearchStripeProducts = createRoute({
	scopes: [Scopes.Plans.Read],
	query: StripeProductSearchParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;
		const { search, limit } = c.req.valid("query");
		const normalizedSearch = search?.trim() ?? "";

		if (!isStripeConnected({ org, env })) {
			return c.json(
				StripeProductSearchResponseSchema.parse({
					stripe_connected: false,
					stripe_products: [],
				}),
			);
		}

		const stripeCli = createStripeCli({ org, env });
		const productsById = new Map();

		const retrieveProduct = async () => {
			if (!isStripeProductId(normalizedSearch)) return;

			try {
				const product = await stripeCli.products.retrieve(normalizedSearch);
				if ("deleted" in product && product.deleted) return;
				const catalogProduct = stripeProductToCatalogProduct(product);
				productsById.set(catalogProduct.id, catalogProduct);
			} catch (error) {
				logger.warn(
					`[stripe.products.search] Stripe product ${normalizedSearch} not found: ${error}`,
				);
			}
		};

		const searchProducts = async () => {
			try {
				if (!shouldSearchByName(normalizedSearch)) {
					const listed = await stripeCli.products.list({
						active: true,
						limit,
					});
					for (const product of listed.data) {
						const catalogProduct = stripeProductToCatalogProduct(product);
						productsById.set(catalogProduct.id, catalogProduct);
					}
					return;
				}

				const searched = await stripeCli.products.search({
					query: `active:'true' AND name~'${escapeStripeSearchValue(normalizedSearch)}'`,
					limit,
				});
				for (const product of searched.data) {
					const catalogProduct = stripeProductToCatalogProduct(product);
					productsById.set(catalogProduct.id, catalogProduct);
				}
			} catch (error) {
				logger.warn(`[stripe.products.search] Failed to search products: ${error}`);
			}
		};

		await Promise.all([retrieveProduct(), searchProducts()]);

		return c.json(
			StripeProductSearchResponseSchema.parse({
				stripe_connected: true,
				stripe_products: Array.from(productsById.values()),
			}),
		);
	},
});
