import type { LineItem } from "@models/billingModels/lineItem/lineItem";
import type { FixedPriceConfig } from "@models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { UsagePriceConfig } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type Stripe from "stripe";

/**
 * Match priority levels for Autumn LineItem to Stripe InvoiceLineItem matching.
 * Lower number = higher priority (more specific match).
 */
export enum LineItemMatchPriority {
	/** Exact match by autumn_line_item_id in Stripe metadata */
	ExactLineItemId = 1,
	/** Match by autumn_customer_price_id in Stripe metadata */
	CustomerPriceId = 2,
	/** Match by stripe_price_id */
	StripePriceId = 3,
	/** Match by stripe_product_id */
	StripeProductId = 4,
	/** No match */
	NoMatch = 0,
}

/**
 * Extracts metadata from a Stripe invoice line item.
 * Checks both the line item's direct metadata and subscription item metadata if provided.
 */
const getLineItemMetadata = ({
	stripeLineItem,
	subscriptionItemMetadata,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	subscriptionItemMetadata?: Stripe.Metadata;
}): Stripe.Metadata => {
	let metadata = stripeLineItem.metadata ?? {};

	// If subscription item metadata is provided (fetched separately), merge it
	if (subscriptionItemMetadata) {
		// Subscription item metadata takes precedence (more specific)
		metadata = { ...metadata, ...subscriptionItemMetadata };
	}

	return metadata;
};

/**
 * Checks if an Autumn LineItem matches a Stripe InvoiceLineItem.
 * Returns a match priority level indicating how specific the match is.
 *
 * Priority order (highest to lowest):
 * 1. autumn_line_item_id (exact match via metadata)
 * 2. autumn_customer_price_id (via metadata)
 * 3. stripe_price_id (via price config)
 * 4. stripe_product_id (via product processor)
 * 0. No match
 */
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

	// 1. Check for exact match by autumn_line_item_id
	const autumnLineItemId = metadata?.autumn_line_item_id;
	if (autumnLineItemId && lineItem.id === autumnLineItemId) {
		return LineItemMatchPriority.ExactLineItemId;
	}

	// 2. Check for match by autumn_customer_price_id
	const autumnCustomerPriceId = metadata?.autumn_customer_price_id;
	if (
		autumnCustomerPriceId &&
		lineItem.context.customerPrice?.id === autumnCustomerPriceId
	) {
		return LineItemMatchPriority.CustomerPriceId;
	}

	// 3. Check for match by stripe_price_id
	const stripePriceId = priceDetails?.price;
	if (stripePriceId) {
		const config = lineItem.context.price.config as
			| UsagePriceConfig
			| FixedPriceConfig;
		if (
			config.stripe_price_id === stripePriceId ||
			("stripe_prepaid_price_v2_id" in config &&
				config.stripe_prepaid_price_v2_id === stripePriceId)
		) {
			return LineItemMatchPriority.StripePriceId;
		}
	}

	// 4. Check for match by stripe_product_id (main product or feature product)
	const stripeProductId = priceDetails?.product;
	if (stripeProductId) {
		// Check main product's processor ID
		if (lineItem.context.product.processor?.id === stripeProductId) {
			return LineItemMatchPriority.StripeProductId;
		}
		// Check feature's stripe_product_id from price config (for prepaid/usage prices)
		const priceConfig = lineItem.context.price.config as
			| UsagePriceConfig
			| FixedPriceConfig;
		if (priceConfig.stripe_product_id === stripeProductId) {
			return LineItemMatchPriority.StripeProductId;
		}
	}

	return LineItemMatchPriority.NoMatch;
};
