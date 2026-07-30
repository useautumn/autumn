import {
	Scopes,
	StripeProductSearchParamsSchema,
	StripeProductSearchResponseSchema,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { stripeProductToCatalogProduct } from "@/internal/catalog/actions/catalogMappings/catalogMappingUtils.js";
import { isStripeConnected } from "../../orgUtils.js";

const STRIPE_PRODUCT_ID_PREFIX = "prod_";
// Stripe's `name~` substring search requires at least 3 characters.
const MIN_NAME_SEARCH_LENGTH = 3;
const LOCAL_FILTER_LIST_LIMIT = 100;

const isStripeProductId = (search: string) =>
	search.trim().startsWith(STRIPE_PRODUCT_ID_PREFIX);

const escapeStripeSearchValue = (value: string) =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

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

		const addProducts = (products: Stripe.Product[]) => {
			for (const product of products) {
				const catalogProduct = stripeProductToCatalogProduct(product);
				productsById.set(catalogProduct.id, catalogProduct);
			}
		};

		const listActiveProducts = async (listLimit: number) => {
			const listed = await stripeCli.products.list({
				active: true,
				limit: listLimit,
			});
			return listed.data;
		};

		const searchProducts = async () => {
			try {
				// Product IDs only ever match exactly, via retrieveProduct. Listing or
				// name-searching here would return unrelated products.
				if (isStripeProductId(normalizedSearch)) return;

				if (!normalizedSearch) {
					addProducts(await listActiveProducts(limit));
					return;
				}

				if (normalizedSearch.length < MIN_NAME_SEARCH_LENGTH) {
					const listed = await listActiveProducts(LOCAL_FILTER_LIST_LIMIT);
					const lowercasedSearch = normalizedSearch.toLowerCase();
					addProducts(
						listed
							.filter((product) =>
								product.name?.toLowerCase().includes(lowercasedSearch),
							)
							.slice(0, limit),
					);
					return;
				}

				const searched = await stripeCli.products.search({
					query: `active:'true' AND name~'${escapeStripeSearchValue(normalizedSearch)}'`,
					limit,
				});
				addProducts(searched.data);
			} catch (error) {
				logger.warn(
					`[stripe.products.search] Failed to search products: ${error}`,
				);
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
