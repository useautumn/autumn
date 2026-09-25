import {
	type FixedPriceConfig,
	type FullCusProduct,
	getAllPriceStripeIds,
	isConsumablePrice,
	isFixedPrice,
	type Price,
	type SyncProductContext,
	stripeToAtmnAmount,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { generateId } from "@/utils/genUtils";

const stripeProductIdOf = (stripePrice: Stripe.Price) =>
	typeof stripePrice.product === "string"
		? stripePrice.product
		: stripePrice.product.id;

const stripeUnitAmount = (stripePrice: Stripe.Price) =>
	Number(stripePrice.unit_amount_decimal ?? stripePrice.unit_amount);

const isSameInterval = ({
	stripePrice,
	interval,
	intervalCount,
}: {
	stripePrice: Stripe.Price;
	interval: string | null | undefined;
	intervalCount: number | null | undefined;
}) =>
	stripePrice.recurring?.interval === interval &&
	stripePrice.recurring?.interval_count === (intervalCount ?? 1);

/** A metered item billing the same amount per billing unit. */
const billsLikeMeteredPrice = ({
	stripePrice,
	config,
}: {
	stripePrice: Stripe.Price;
	config: UsagePriceConfig;
}) => {
	const [tier, ...otherTiers] = config.usage_tiers ?? [];
	if (!tier || otherTiers.length > 0) return false;
	if (stripePrice.recurring?.usage_type !== "metered") return false;
	if (!stripePrice.recurring.meter) return false;
	if (
		!isSameInterval({
			stripePrice,
			interval: config.interval,
			intervalCount: config.interval_count,
		})
	)
		return false;

	const billingUnits = stripePrice.transform_quantity?.divide_by ?? 1;
	if (billingUnits !== (config.billing_units ?? 1)) return false;
	return (
		stripeToAtmnAmount({
			amount: stripeUnitAmount(stripePrice) * billingUnits,
			currency: stripePrice.currency,
		}) === tier.amount
	);
};

/** A flat licensed item billing the same base amount. */
const billsLikeBasePrice = ({
	stripePrice,
	config,
}: {
	stripePrice: Stripe.Price;
	config: FixedPriceConfig;
}) =>
	stripePrice.recurring?.usage_type === "licensed" &&
	stripePrice.billing_scheme === "per_unit" &&
	isSameInterval({
		stripePrice,
		interval: config.interval,
		intervalCount: config.interval_count,
	}) &&
	stripeToAtmnAmount({
		amount: stripeUnitAmount(stripePrice),
		currency: stripePrice.currency,
	}) === config.amount;

/** The Stripe link a price should carry, or undefined when it can't be linked. */
const linkedConfigFor = ({
	price,
	stripePrice,
}: {
	price: Price;
	stripePrice: Stripe.Price;
}): Price["config"] | undefined => {
	if (isConsumablePrice(price)) {
		if (!billsLikeMeteredPrice({ stripePrice, config: price.config }))
			return undefined;
		return {
			...price.config,
			stripe_price_id: stripePrice.id,
			stripe_product_id: stripeProductIdOf(stripePrice),
			stripe_meter_id: stripePrice.recurring?.meter,
		};
	}

	if (isFixedPrice(price)) {
		const config = price.config as FixedPriceConfig;
		if (!billsLikeBasePrice({ stripePrice, config })) return undefined;
		return {
			...config,
			stripe_price_id: stripePrice.id,
			stripe_product_id: stripeProductIdOf(stripePrice),
			base_currency: stripePrice.currency,
		};
	}

	return undefined;
};

const findReusablePrice = ({
	currentCustomerProduct,
	price,
	stripePriceId,
}: {
	currentCustomerProduct?: FullCusProduct;
	price: Price;
	stripePriceId: string;
}): Price | undefined =>
	currentCustomerProduct?.customer_prices
		.map((customerPrice) => customerPrice.price)
		.find(
			(existing) =>
				existing.is_custom &&
				existing.entitlement_id === price.entitlement_id &&
				isFixedPrice(existing) === isFixedPrice(price) &&
				getAllPriceStripeIds({ config: existing.config }).includes(
					stripePriceId,
				),
		);

const linkProductContext = ({
	productContext,
	stripePrices,
	claimedStripePriceIds,
}: {
	productContext: SyncProductContext;
	stripePrices: Stripe.Price[];
	claimedStripePriceIds: Set<string>;
}): SyncProductContext => {
	const { fullProduct, customPrices, currentCustomerProduct } = productContext;
	let prices = fullProduct.prices;
	let nextCustomPrices = customPrices;

	for (const price of fullProduct.prices) {
		const stripeIds = getAllPriceStripeIds({ config: price.config });
		if (stripePrices.some(({ id }) => stripeIds.includes(id))) continue;

		const [match, ...ambiguous] = stripePrices.flatMap((stripePrice) => {
			if (!stripePrice.active || claimedStripePriceIds.has(stripePrice.id))
				return [];
			const config = linkedConfigFor({ price, stripePrice });
			return config ? [{ stripePrice, config }] : [];
		});
		if (!match || ambiguous.length > 0) continue;
		claimedStripePriceIds.add(match.stripePrice.id);

		// A previous sync may already hold this exact link — reuse it rather than
		// minting a new custom price on every re-sync.
		const reusable = findReusablePrice({
			currentCustomerProduct,
			price,
			stripePriceId: match.stripePrice.id,
		});
		// A custom price this sync is creating gets the link in place; a catalog or
		// already-saved price is copied, so the shared row is never changed.
		const isNewCustomPrice = customPrices.includes(price);
		const linked: Price =
			reusable ??
			(isNewCustomPrice
				? { ...price, config: match.config }
				: {
						...price,
						id: generateId("pr"),
						is_custom: true,
						created_at: Date.now(),
						config: match.config,
					});

		prices = prices.map((existing) => (existing === price ? linked : existing));
		nextCustomPrices = [
			...nextCustomPrices.filter((existing) => existing !== price),
			...(reusable ? [] : [linked]),
		];
	}

	if (prices === fullProduct.prices) return productContext;
	return {
		...productContext,
		fullProduct: { ...fullProduct, prices },
		customPrices: nextCustomPrices,
	};
};

/**
 * Sync owns Stripe links: each metered or base price that no phase item bills by
 * id adopts the one active item billing the same amount — so verify pairs it and
 * later updates reuse that item. Archived prices are never adopted; Autumn can't
 * reuse them, and verify already pairs them by amount.
 */
export const linkSyncedPricesToStripe = ({
	productContexts,
	stripePrices,
	claimedStripePriceIds,
}: {
	productContexts: SyncProductContext[];
	stripePrices: Stripe.Price[];
	claimedStripePriceIds: Set<string>;
}): SyncProductContext[] => {
	// Items some synced price already bills through are never up for adoption.
	for (const { fullProduct } of productContexts) {
		for (const price of fullProduct.prices) {
			for (const stripeId of getAllPriceStripeIds({ config: price.config })) {
				claimedStripePriceIds.add(stripeId);
			}
		}
	}

	return productContexts.map((productContext) =>
		linkProductContext({
			productContext,
			stripePrices,
			claimedStripePriceIds,
		}),
	);
};
