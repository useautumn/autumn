import {
	atmnToStripeAmount,
	BillingInterval,
	FixedPriceConfigSchema,
	isFixedPrice,
	type Price,
} from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { billingIntervalToStripe } from "@/external/stripe/stripePriceUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";

const STRIPE_PRICE_LIST_LIMIT = 100;
const STRIPE_PRICE_LIST_CONCURRENCY = 5;

const stripeProductId = ({
	product,
}: {
	product: string | Stripe.Product | Stripe.DeletedProduct | null;
}) => {
	if (!product) return null;
	return typeof product === "string" ? product : product.id;
};

const runBatches = async <T, R>({
	items,
	size,
	run,
}: {
	items: T[];
	size: number;
	run: (item: T) => Promise<R>;
}) => {
	const results: R[] = [];
	for (let index = 0; index < items.length; index += size) {
		const batch = items.slice(index, index + size);
		results.push(...(await Promise.all(batch.map(run))));
	}
	return results;
};

export const stripePriceMatchesFixedPrice = ({
	stripePrice,
	price,
	stripeProductId: expectedStripeProductId,
	currency,
}: {
	stripePrice: Stripe.Price;
	price: Price;
	stripeProductId: string;
	currency: string;
}) => {
	if (!isFixedPrice(price)) return false;

	const config = FixedPriceConfigSchema.parse(price.config);
	if (config.interval === BillingInterval.OneOff) return false;
	if (stripeProductId({ product: stripePrice.product }) !== expectedStripeProductId) {
		return false;
	}
	if (!stripePrice.active) return false;
	if (!stripePrice.recurring) return false;
	if (stripePrice.currency.toLowerCase() !== currency.toLowerCase()) return false;
	if (stripePrice.billing_scheme !== "per_unit") return false;

	const recurring = billingIntervalToStripe({
		interval: config.interval,
		intervalCount: config.interval_count,
	});
	if (!recurring.interval) return false;

	return (
		stripePrice.unit_amount ===
			atmnToStripeAmount({ amount: config.amount, currency }) &&
		stripePrice.recurring.interval === recurring.interval &&
		stripePrice.recurring.interval_count === recurring.interval_count
	);
};

const listStripePricesForProduct = async ({
	stripeCli,
	stripeProductId,
}: {
	stripeCli: Stripe;
	stripeProductId: string;
}) => {
	try {
		const response = await stripeCli.prices.list({
			product: stripeProductId,
			active: true,
			limit: STRIPE_PRICE_LIST_LIMIT,
		});
		return response.data;
	} catch (error) {
		if (
			error instanceof Stripe.errors.StripeError &&
			error.code?.includes("resource_missing")
		) {
			return [];
		}
		throw error;
	}
};

export const listExistingStripePricesByProduct = async ({
	ctx,
	stripeProductIds,
}: {
	ctx: AutumnContext;
	stripeProductIds: string[];
}) => {
	const uniqueProductIds = [...new Set(stripeProductIds)];
	const pricesByProduct = new Map<string, Stripe.Price[]>();
	if (uniqueProductIds.length === 0) return pricesByProduct;
	if (!isStripeConnected({ org: ctx.org, env: ctx.env })) return pricesByProduct;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const entries = await runBatches({
		items: uniqueProductIds,
		size: STRIPE_PRICE_LIST_CONCURRENCY,
		run: async (stripeProductId) => ({
			stripeProductId,
			prices: await listStripePricesForProduct({ stripeCli, stripeProductId }),
		}),
	});

	for (const entry of entries) {
		pricesByProduct.set(entry.stripeProductId, entry.prices);
	}
	return pricesByProduct;
};

export const findMatchingStripePriceForFixedPrice = ({
	price,
	stripeProductId,
	stripePrices,
	currency,
}: {
	price: Price;
	stripeProductId: string;
	stripePrices: Stripe.Price[];
	currency: string;
}) =>
	stripePrices.find((stripePrice) =>
		stripePriceMatchesFixedPrice({
			stripePrice,
			price,
			stripeProductId,
			currency,
		}),
	);
