import {
	type FullProduct,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	type Organization,
	type Price,
	priceToEnt,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	autumnAllocatedPriceToStripePriceShape,
	autumnBasePriceToStripePriceShape,
	autumnConsumablePriceToStripePriceShape,
	autumnPrepaidPriceToStripePriceShape,
} from "../../matchUtils/autumnPriceShape";
import {
	stripePriceShapesEqual,
	stripePriceToShape,
} from "../../matchUtils/stripePriceShape";

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
	if (!stripePrice.active) return false;

	const autumnShape = autumnBasePriceToStripePriceShape({
		price,
		stripeProductId: expectedStripeProductId,
		currency,
	});
	if (!autumnShape) return false;

	return stripePriceShapesEqual(
		stripePriceToShape({ price: stripePrice }),
		autumnShape,
	);
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

const stripeMeterId = ({
	recurring,
}: {
	recurring: Stripe.Price.Recurring | null;
}) => {
	const meter = (
		recurring as (Stripe.Price.Recurring & { meter?: unknown }) | null
	)?.meter;
	if (!meter) return null;
	return typeof meter === "string"
		? meter
		: ((meter as { id?: string }).id ?? null);
};

export const stripePriceMatchesConsumablePrice = ({
	stripePrice,
	price,
	product,
	stripeProductId: expectedStripeProductId,
	currency,
	org,
}: {
	stripePrice: Stripe.Price;
	price: Price;
	product: FullProduct;
	stripeProductId: string;
	currency: string;
	org: Organization;
}) => {
	if (!stripePrice.active) return false;
	if (!isConsumablePrice(price)) return false;

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
		errorOnNotFound: true,
	});
	const autumnShape = autumnConsumablePriceToStripePriceShape({
		price,
		entitlement,
		stripeProductId: expectedStripeProductId,
		currency,
		org,
	});
	if (!autumnShape) return false;

	return stripePriceShapesEqual(
		stripePriceToShape({ price: stripePrice }),
		autumnShape,
	);
};

export const findMatchingStripePriceForConsumablePrice = ({
	price,
	product,
	stripeProductId,
	stripePrices,
	currency,
	org,
}: {
	price: Price;
	product: FullProduct;
	stripeProductId: string;
	stripePrices: Stripe.Price[];
	currency: string;
	org: Organization;
}) => {
	const matchedStripePrice = stripePrices.find((stripePrice) =>
		stripePriceMatchesConsumablePrice({
			stripePrice,
			price,
			product,
			stripeProductId,
			currency,
			org,
		}),
	);

	return matchedStripePrice
		? {
				stripePriceId: matchedStripePrice.id,
				stripeMeterId: stripeMeterId({
					recurring: matchedStripePrice.recurring,
				}),
			}
		: null;
};

export const stripePriceMatchesAllocatedPrice = ({
	stripePrice,
	price,
	product,
	stripeProductId: expectedStripeProductId,
	currency,
	org,
}: {
	stripePrice: Stripe.Price;
	price: Price;
	product: FullProduct;
	stripeProductId: string;
	currency: string;
	org: Organization;
}) => {
	if (!stripePrice.active) return false;
	if (!isAllocatedPrice(price)) return false;

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});
	if (!entitlement) return false;

	const autumnShape = autumnAllocatedPriceToStripePriceShape({
		price,
		entitlement,
		stripeProductId: expectedStripeProductId,
		currency,
		org,
	});
	if (!autumnShape) return false;

	return stripePriceShapesEqual(
		stripePriceToShape({ price: stripePrice }),
		autumnShape,
	);
};

export const stripePriceMatchesPrepaidPrice = ({
	stripePrice,
	price,
	product,
	stripeProductId: expectedStripeProductId,
	currency,
	org,
}: {
	stripePrice: Stripe.Price;
	price: Price;
	product: FullProduct;
	stripeProductId: string;
	currency: string;
	org: Organization;
}) => {
	if (!stripePrice.active) return false;
	if (!isPrepaidPrice(price)) return false;

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});
	if (!entitlement) return false;

	const autumnShape = autumnPrepaidPriceToStripePriceShape({
		price,
		entitlement,
		stripeProductId: expectedStripeProductId,
		currency,
		org,
	});
	if (!autumnShape) return false;

	return stripePriceShapesEqual(
		stripePriceToShape({ price: stripePrice }),
		autumnShape,
	);
};
