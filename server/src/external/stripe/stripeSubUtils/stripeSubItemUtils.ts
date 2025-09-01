import {
	type BillingType,
	type FullCusProduct,
	type Price,
	PriceType,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

const autumnStripePricesMatch = ({
	stripePrice,
	autumnPrice,
	stripeProdId,
}: {
	stripePrice: Stripe.Price;
	autumnPrice: Price;
	stripeProdId?: string;
}) => {
	const config = autumnPrice.config as UsagePriceConfig;

	if (config.type === PriceType.Fixed) {
		return (
			config.stripe_price_id === stripePrice.id ||
			(stripeProdId && stripePrice.product === stripeProdId)
		);
	} else {
		return (
			config.stripe_price_id === stripePrice.id ||
			config.stripe_product_id === stripePrice.product ||
			config.stripe_empty_price_id === stripePrice.id
		);
	}
};

export const priceToScheduleItem = ({
	price,
	scheduleItems,
	stripeProdId,
}: {
	price: Price;
	scheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
	stripeProdId?: string;
}) => {
	for (const scheduleItem of scheduleItems) {
		// 1. If price is fixed
		const schedulePrice = scheduleItem.price as Stripe.Price;

		if (
			autumnStripePricesMatch({
				stripePrice: schedulePrice,
				autumnPrice: price,
				stripeProdId,
			})
		) {
			return scheduleItem;
		}
	}

	return undefined;
};

// TO FIX
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
		if (isFixedPrice({ price })) {
			return stripeItems.find(
				(si: Stripe.SubscriptionItem | Stripe.LineItem) => {
					const config = price.config as UsagePriceConfig;

					return (
						config.stripe_price_id === si.price?.id ||
						(stripeProdId && si.price?.product === stripeProdId)
					);
				},
			);
		}

		return undefined;

		// return stripeItems.find((si: Stripe.SubscriptionItem | Stripe.LineItem) => {
		//   const config = price.config as UsagePriceConfig;

		//   if (config.type == PriceType.Fixed) {
		//     return (
		//       config.stripe_price_id == si.price?.id ||
		//       (stripeProdId && si.price?.product == stripeProdId)
		//     );
		//   } else {
		//     return (
		//       config.stripe_price_id == si.price?.id ||
		//       config.stripe_product_id == si.price?.product ||
		//       config.stripe_empty_price_id == si.price?.id
		//     );
		//   }
		// });
	}
};

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

		let itemMatch;
		if (subItem) {
			itemMatch =
				config.stripe_price_id === subItem.price?.id ||
				config.stripe_product_id === subItem.price?.product;
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

export const findStripePriceFromPrices = ({
	stripePrices,
	autumnPrice,
}: {
	stripePrices: Stripe.Price[];
	autumnPrice: Price;
}) => {
	return stripePrices.find((p: Stripe.Price) =>
		autumnStripePricesMatch({
			stripePrice: p,
			autumnPrice,
		}),
	);
};

export const lineItemInCusProduct = ({
	cusProduct,
	lineItem,
}: {
	cusProduct: FullCusProduct;
	lineItem: Stripe.InvoiceLineItem;
}) => {
	const stripeProdId = cusProduct.product.processor?.id;

	const prices = cusProductToPrices({ cusProduct });
	const price = findPriceInStripeItems({ prices, lineItem });

	const priceDetails = lineItem.pricing?.price_details;

	return stripeProdId === priceDetails?.product || notNullish(price);
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

export const scheduleItemToPrice = ({
	scheduleItem,
	cusProducts,
}: {
	scheduleItem: Stripe.SubscriptionSchedule.Phase.Item;
	cusProducts: FullCusProduct[];
}) => {
	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const price = prices.find((p) => {
			const stripePrice = scheduleItem.price as Stripe.Price;
			return autumnStripePricesMatch({
				stripePrice,
				autumnPrice: p,
			});
		});

		if (price) {
			return price;
		}
	}

	return undefined;
};

export const scheduleItemInCusProduct = ({
	cusProduct,
	scheduleItem,
}: {
	cusProduct: FullCusProduct;
	scheduleItem: Stripe.SubscriptionSchedule.Phase.Item;
}) => {
	const stripeProdId = cusProduct.product.processor?.id;

	const autumnPrices = cusProductToPrices({ cusProduct });
	const price = autumnPrices.find((p) => {
		const stripePrice = scheduleItem.price as Stripe.Price;

		return autumnStripePricesMatch({
			stripePrice,
			autumnPrice: p,
			stripeProdId,
		});
	});

	return notNullish(price);
};

export const isLicenseItem = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem | Stripe.LineItem;
}) => {
	return stripeItem.price?.recurring?.usage_type === "licensed";
};

export const isMeteredItem = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem | Stripe.LineItem;
}) => {
	return stripeItem.price?.recurring?.usage_type === "metered";
};

// Get sub item from product
