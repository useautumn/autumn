import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type { FixedPriceConfig } from "@models/productModels/priceModels/priceConfig/fixedPriceConfig";
import { getAllPriceStripeIds } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type Stripe from "stripe";

export enum LineItemMatchPriority {
	ExactLineItemId = 1,
	CustomerPriceId = 2,
	StripePriceId = 3,
	StripeProductId = 4,
	NoMatch = 0,
}

const getLineItemMetadata = ({
	stripeLineItem,
	subscriptionItemMetadata,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	subscriptionItemMetadata?: Stripe.Metadata;
}): Stripe.Metadata => {
	let metadata = stripeLineItem.metadata ?? {};

	if (subscriptionItemMetadata) {
		metadata = { ...metadata, ...subscriptionItemMetadata };
	}

	return metadata;
};

export const billingLineItemMatchesStripeLineItem = ({
	lineItem,
	stripeLineItem,
	subscriptionItemMetadata,
}: {
	lineItem: LineItem;
	stripeLineItem: Stripe.InvoiceLineItem;
	subscriptionItemMetadata?: Stripe.Metadata;
}): LineItemMatchPriority => {
	const metadata = getLineItemMetadata({
		stripeLineItem,
		subscriptionItemMetadata,
	});
	const priceDetails = stripeLineItem.pricing?.price_details;

	const autumnLineItemId = metadata?.autumn_line_item_id;
	if (autumnLineItemId && lineItem.id === autumnLineItemId) {
		return LineItemMatchPriority.ExactLineItemId;
	}

	const autumnCustomerPriceId = metadata?.autumn_customer_price_id;
	if (
		autumnCustomerPriceId &&
		lineItem.context.customerPrice?.id === autumnCustomerPriceId
	) {
		return LineItemMatchPriority.CustomerPriceId;
	}

	const stripePriceId = priceDetails?.price;
	if (stripePriceId) {
		const config = lineItem.context.price.config as
			| UsagePriceConfig
			| FixedPriceConfig;
		const matchableIds = getAllPriceStripeIds({
			config,
			slots: ["stripe_price_id", "stripe_prepaid_price_v2_id"],
		});
		if (matchableIds.includes(stripePriceId)) {
			return LineItemMatchPriority.StripePriceId;
		}
	}

	const stripeProductId = priceDetails?.product;
	if (stripeProductId) {
		if (lineItem.context.product.processor?.id === stripeProductId) {
			return LineItemMatchPriority.StripeProductId;
		}
		const priceConfig = lineItem.context.price.config as
			| UsagePriceConfig
			| FixedPriceConfig;
		if (priceConfig.stripe_product_id === stripeProductId) {
			return LineItemMatchPriority.StripeProductId;
		}
	}

	return LineItemMatchPriority.NoMatch;
};
