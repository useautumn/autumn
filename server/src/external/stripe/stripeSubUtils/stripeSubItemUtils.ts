import {
	type BillingType,
	cusProductToPrices,
	type FullCusProduct,
	isFixedPrice,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

/**
 * @deprecated Use `findBillingLineItemByStripeLineItem` from `@autumn/shared` instead.
 * This function has incomplete matching logic.
 */
export const findStripeItemForPrice = ({
	price,
	stripeItems,
	invoiceLineItems,
	stripeProdId,
}: {
	price: Price;
	stripeItems?: Stripe.SubscriptionItem[] | Stripe.LineItem[];
	invoiceLineItems?: Stripe.InvoiceLineItem[];
	stripeProdId?: string;
}) => {
	if (invoiceLineItems) {
		return invoiceLineItems.find((li) => {
			return li.pricing?.price_details?.price === price.config.stripe_price_id;
		});
	}

	if (stripeItems) {
		const stripeItem = stripeItems.find(
			(si: Stripe.SubscriptionItem | Stripe.LineItem) => {
				const config = price.config as UsagePriceConfig;

				return (
					config.stripe_price_id === si.price?.id ||
					config.stripe_product_id === si.price?.product ||
					config.stripe_empty_price_id === si.price?.id
				);
			},
		);

		if (stripeItem) return stripeItem;

		// Fallback to fixed price
		if (isFixedPrice(price)) {
			return stripeItems.find(
				(si: Stripe.SubscriptionItem | Stripe.LineItem) => {
					const config = price.config;

					return (
						config.stripe_price_id === si.price?.id ||
						(stripeProdId && si.price?.product === stripeProdId)
					);
				},
			);
		}

		return undefined;
	}
};

/**
 * @deprecated Use `findBillingLineItemByStripeLineItem` from `@autumn/shared` instead.
 * This function has incomplete matching logic.
 */
export const findPriceInStripeItems = ({
	prices,
	subItem,
	lineItem,
	billingType,
}: {
	prices: Price[];
	subItem?: Stripe.SubscriptionItem;
	lineItem?: Stripe.InvoiceItem | Stripe.InvoiceLineItem;
	billingType?: BillingType;
}) => {
	return prices.find((p: Price) => {
		const config = p.config;

		let itemMatch: boolean = false;
		if (subItem) {
			itemMatch =
				config.stripe_price_id === subItem.price?.id ||
				config.stripe_product_id === subItem.price?.product ||
				config.stripe_empty_price_id === subItem.price?.id;
		}

		if (lineItem) {
			const priceDetails = lineItem.pricing?.price_details;
			itemMatch =
				config.stripe_price_id === priceDetails?.price ||
				config.stripe_product_id === priceDetails?.product;
		}

		const priceBillingType = getBillingType(config);
		const billingTypeMatch = billingType
			? priceBillingType === billingType
			: true;

		return itemMatch && billingTypeMatch;
	});
};

export const subItemInCusProduct = ({
	cusProduct,
	subItem,
}: {
	cusProduct: FullCusProduct;
	subItem: Stripe.SubscriptionItem;
}) => {
	const stripeProdId = cusProduct.product.processor?.id;

	const prices = cusProductToPrices({ cusProduct });
	const price = findPriceInStripeItems({ prices, subItem });

	return stripeProdId === subItem.price.product || notNullish(price);
};

export const isLicenseItem = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem | Stripe.LineItem;
}) => {
	return stripeItem.price?.recurring?.usage_type === "licensed";
};
