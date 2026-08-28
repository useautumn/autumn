import {
	type CatalogStripePrice,
	Scopes,
	StripePriceSearchParamsSchema,
	StripePriceSearchResponseSchema,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "../../orgUtils.js";

const STRIPE_PRICE_ID_PREFIX = "price_";
const STRIPE_PRODUCT_ID_PREFIX = "prod_";

const stripePriceToCatalogPrice = (
	stripePrice: Stripe.Price,
): CatalogStripePrice => {
	const product = stripePrice.product;
	const expandedProduct =
		product &&
		typeof product !== "string" &&
		!("deleted" in product && product.deleted)
			? product
			: null;

	return {
		id: stripePrice.id,
		nickname: stripePrice.nickname ?? null,
		unit_amount: stripePrice.unit_amount ?? null,
		currency: stripePrice.currency,
		interval: stripePrice.recurring?.interval ?? null,
		interval_count: stripePrice.recurring?.interval_count ?? null,
		active: stripePrice.active,
		product_id:
			typeof product === "string" ? product : (expandedProduct?.id ?? null),
		product_name: expandedProduct?.name ?? null,
	};
};

/**
 * Two lookups, no free-text search: an exact price id, or every price under a
 * product id. Stripe cannot match price ids by substring, so anything else
 * would return unrelated prices — those queries never reach Stripe.
 */
export const handleSearchStripePrices = createRoute({
	scopes: [Scopes.Plans.Read],
	query: StripePriceSearchParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;
		const { search, limit } = c.req.valid("query");
		const normalizedSearch = search?.trim() ?? "";

		const respond = ({
			stripeConnected,
			stripePrices = [],
		}: {
			stripeConnected: boolean;
			stripePrices?: Stripe.Price[];
		}) =>
			c.json(
				StripePriceSearchResponseSchema.parse({
					stripe_connected: stripeConnected,
					stripe_prices: stripePrices.map(stripePriceToCatalogPrice),
				}),
			);

		if (!isStripeConnected({ org, env })) {
			return respond({ stripeConnected: false });
		}

		const stripeCli = createStripeCli({ org, env });

		try {
			if (normalizedSearch.startsWith(STRIPE_PRICE_ID_PREFIX)) {
				const stripePrice = await stripeCli.prices.retrieve(normalizedSearch, {
					expand: ["product"],
				});
				return respond({ stripeConnected: true, stripePrices: [stripePrice] });
			}

			if (normalizedSearch.startsWith(STRIPE_PRODUCT_ID_PREFIX)) {
				const listed = await stripeCli.prices.list({
					product: normalizedSearch,
					active: true,
					limit,
					expand: ["data.product"],
				});
				return respond({ stripeConnected: true, stripePrices: listed.data });
			}
		} catch (error) {
			logger.warn(
				`[stripe.prices.search] Lookup failed for ${normalizedSearch}: ${error}`,
			);
		}

		return respond({ stripeConnected: true });
	},
});
