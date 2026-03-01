import { generateKsuid } from "@autumn/ksuid";
import {
	type FixedPriceConfig,
	filterBillingLineItemsByStripeLineItem,
	type InsertDbInvoiceLineItem,
	type InvoiceLineItemDiscount,
	type LineItem,
	secondsToMs,
	stripeToAtmnAmount,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import type { StripeLineItemGroup } from "./groupStripeLineItems";
import { stripeDiscountsToDbDiscounts } from "./stripeDiscountsToDbDiscounts";

/** Map of subscription_item_id -> metadata */
type SubscriptionItemMetadataMap = Map<string, Stripe.Metadata>;

/**
 * Converts a group of Stripe line items to Autumn DB invoice line items.
 *
 * For single-item groups: matches to Autumn LineItem(s), creates one DB row.
 * For multi-item groups (tiered): matches first item to Autumn LineItem(s),
 * applies context to all items in group.
 *
 * Multi-entity support: One Stripe line item can match multiple Autumn line items
 * (e.g., when 2 entities each have a $20 base price merged into one $40 Stripe item).
 * All matched customer_product_ids and customer_entitlement_ids are collected into arrays.
 */
export const stripeLineItemGroupToDbLineItems = ({
	group,
	invoiceId,
	stripeInvoiceId,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	group: StripeLineItemGroup;
	invoiceId: string;
	stripeInvoiceId: string;
	autumnLineItems: LineItem[];
	subscriptionItemMetadata?: SubscriptionItemMetadataMap;
}): {
	dbLineItems: InsertDbInvoiceLineItem[];
	matchedAutumnLineItems: LineItem[];
} => {
	// Use first line item as representative for matching
	const representativeLineItem = group.lineItems[0];

	// Get subscription item metadata if available
	const subItemId =
		representativeLineItem.parent?.subscription_item_details?.subscription_item;
	const subItemMetadata =
		typeof subItemId === "string"
			? subscriptionItemMetadata?.get(subItemId)
			: undefined;

	// Find ALL matching Autumn LineItems (multi-entity support)
	const matchedLineItems = filterBillingLineItemsByStripeLineItem({
		stripeLineItem: representativeLineItem,
		autumnLineItems,
		subscriptionItemMetadata: subItemMetadata,
	});

	// Determine stripe_subscription_item_id for grouping
	const stripeSubscriptionItemId =
		group.groupType === "subscription_item" ? group.groupKey : null;

	// Check if this is a multi-item group (tiered pricing)
	const isMultiItemGroup = group.lineItems.length > 1;

	// Convert each Stripe line item to DB row
	const dbLineItems = group.lineItems.map((stripeLineItem) => {
		if (matchedLineItems.length > 0) {
			// Matched: inherit Autumn context, but use Stripe amounts/quantities
			return mergeStripeAndBillingLineItems({
				stripeLineItem,
				billingLineItems: matchedLineItems,
				invoiceId,
				stripeInvoiceId,
				stripeSubscriptionItemId,
				isMultiItemGroup,
			});
		}
		// Fallback: create from Stripe data only
		return createDbLineItemFromStripeOnly({
			stripeLineItem,
			invoiceId,
			stripeInvoiceId,
			stripeSubscriptionItemId,
		});
	});

	return { dbLineItems, matchedAutumnLineItems: matchedLineItems };
};

/**
 * Creates DB line item by merging Stripe line item data with Autumn billing line item context.
 * Stripe fields: stripe identifiers, amounts, quantities, discounts
 * Autumn fields: entity relationships, billing timing, direction, prorated
 *
 * For multi-item groups (tiered pricing), we use Stripe's description (includes tier info)
 * and mark description_source as "stripe".
 *
 * Multi-entity support: Accepts array of billing line items and collects all
 * customer_product_ids and customer_entitlement_ids into arrays.
 */
const mergeStripeAndBillingLineItems = ({
	stripeLineItem,
	billingLineItems,
	invoiceId,
	stripeInvoiceId,
	stripeSubscriptionItemId,
	isMultiItemGroup,
}: {
	stripeLineItem: ExpandedStripeInvoiceLineItem;
	billingLineItems: LineItem[];
	invoiceId: string;
	stripeInvoiceId: string;
	stripeSubscriptionItemId: string | null;
	isMultiItemGroup: boolean;
}): InsertDbInvoiceLineItem => {
	// Use first billing line item as primary context source
	const primaryLineItem = billingLineItems[0];
	const { context } = primaryLineItem;
	const priceDetails = stripeLineItem.pricing?.price_details;

	// Determine discount data source based on discountable flag
	// When discountable === false, Autumn pre-calculates discounts and sends the post-discount
	// amount to Stripe. So stripeLineItem.amount is already discounted and discount_amounts is empty.
	// In this case, use Autumn's original pre-discount amount and discount breakdown.
	const autumnDiscountable = context.discountable ?? true;
	const hasAutumnDiscounts =
		!autumnDiscountable && primaryLineItem.discounts.length > 0;

	let amount: number;
	let amountAfterDiscounts: number;
	let discounts: InvoiceLineItemDiscount[];

	if (hasAutumnDiscounts) {
		// Non-discountable: Autumn pre-calculated discounts
		// Stripe amount is already post-discount, use Autumn's original values
		amount = primaryLineItem.amount;
		amountAfterDiscounts = primaryLineItem.amountAfterDiscounts;
		discounts = primaryLineItem.discounts.map((d) => ({
			amount_off: d.amountOff,
			percent_off: d.percentOff,
			stripe_coupon_id: d.stripeCouponId,
		}));
	} else {
		// Discountable (or no Autumn discounts): Stripe handles discounts
		// Use Stripe's discount_amounts
		amount = stripeToAtmnAmount({
			amount: stripeLineItem.amount,
			currency: stripeLineItem.currency,
		});
		const discountTotal = (stripeLineItem.discount_amounts ?? []).reduce(
			(sum, d) => sum + d.amount,
			0,
		);
		amountAfterDiscounts = stripeToAtmnAmount({
			amount: stripeLineItem.amount - discountTotal,
			currency: stripeLineItem.currency,
		});
		discounts = stripeDiscountsToDbDiscounts({
			discountAmounts: stripeLineItem.discount_amounts,
			currency: stripeLineItem.currency,
		});
	}

	// Stripe quantity (for reference)
	const stripeQuantity = stripeLineItem.quantity ?? null;

	// Determine quantities based on scenario
	let totalQuantity: number | null = null;
	let paidQuantity: number | null = null;

	if (isMultiItemGroup) {
		// Multi-item group (tiered pricing): use Stripe quantities per tier
		// Each tier has its own quantity from Stripe
		if (stripeQuantity !== null) {
			const priceConfig = context.price.config as
				| UsagePriceConfig
				| FixedPriceConfig;
			const billingUnits = priceConfig.billing_units ?? 1;
			totalQuantity = stripeQuantity * billingUnits;
			paidQuantity = totalQuantity;
		}
	} else {
		// Single item: use Autumn quantities (handles 1:1 and multi-entity)
		const autumnTotalQuantity = billingLineItems.reduce(
			(sum, li) => sum + (li.totalQuantity ?? 0),
			0,
		);
		const autumnPaidQuantity = billingLineItems.reduce(
			(sum, li) => sum + (li.paidQuantity ?? 0),
			0,
		);

		totalQuantity = autumnTotalQuantity || null;
		paidQuantity = autumnPaidQuantity || null;

		// Fall back to Stripe calculation if no Autumn quantities
		if (totalQuantity === null && stripeQuantity !== null) {
			const priceConfig = context.price.config as
				| UsagePriceConfig
				| FixedPriceConfig;
			const billingUnits = priceConfig.billing_units ?? 1;
			totalQuantity = stripeQuantity * billingUnits;
			paidQuantity = totalQuantity;
		}
	}

	// For multi-item groups, use Stripe description (has tier info); otherwise use Autumn
	const useStripeDescription =
		isMultiItemGroup && stripeLineItem.description !== null;
	const description = useStripeDescription
		? (stripeLineItem.description as string)
		: (primaryLineItem.description ?? "");
	const descriptionSource = useStripeDescription ? "stripe" : "autumn";

	// Collect customer_product_ids, customer_price_ids, and customer_entitlement_ids from ALL matched line items
	const customerProductIds = billingLineItems
		.map((li) => li.context.customerProduct?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	const customerPriceIds = billingLineItems
		.map((li) => li.context.customerPrice?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	const customerEntitlementIds = billingLineItems
		.map((li) => li.context.customerEntitlement?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: invoiceId,

		// Stripe fields from actual line item
		stripe_id: stripeLineItem.id,
		stripe_invoice_id: stripeInvoiceId,
		stripe_subscription_item_id: stripeSubscriptionItemId,
		stripe_product_id: (priceDetails?.product as string) ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeLineItem.discountable,

		// Amounts (from Stripe or Autumn depending on discountable flag)
		amount,
		amount_after_discounts: amountAfterDiscounts,
		currency: stripeLineItem.currency,

		// Quantities
		stripe_quantity: stripeQuantity,
		total_quantity: totalQuantity,
		paid_quantity: paidQuantity,

		// Discounts (from Stripe or Autumn depending on discountable flag)
		discounts,

		// Description
		description,
		description_source: descriptionSource,

		// All other context from Autumn LineItem (use primary)
		direction: context.direction,
		billing_timing: context.billingTiming,
		prorated: primaryLineItem.prorated,

		price_id: context.price.id,
		customer_product_ids: customerProductIds,
		customer_price_ids: customerPriceIds,
		customer_entitlement_ids: customerEntitlementIds,
		internal_product_id: context.product.internal_id,
		product_id: context.product.id,
		internal_feature_id: context.feature?.internal_id ?? null,
		feature_id: context.feature?.id ?? null,

		effective_period_start: secondsToMs(stripeLineItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeLineItem.period?.end) ?? null,
	};
};

/**
 * Creates DB line item from Stripe data only (no Autumn context).
 */
const createDbLineItemFromStripeOnly = ({
	stripeLineItem,
	invoiceId,
	stripeInvoiceId,
	stripeSubscriptionItemId,
}: {
	stripeLineItem: ExpandedStripeInvoiceLineItem;
	invoiceId: string;
	stripeInvoiceId: string;
	stripeSubscriptionItemId: string | null;
}): InsertDbInvoiceLineItem => {
	const metadata = stripeLineItem.metadata;
	const priceDetails = stripeLineItem.pricing?.price_details;

	const amount = stripeToAtmnAmount({
		amount: stripeLineItem.amount,
		currency: stripeLineItem.currency,
	});

	const discountTotal = (stripeLineItem.discount_amounts ?? []).reduce(
		(sum, d) => sum + d.amount,
		0,
	);
	const amountAfterDiscounts = stripeToAtmnAmount({
		amount: stripeLineItem.amount - discountTotal,
		currency: stripeLineItem.currency,
	});

	const stripeQuantity = stripeLineItem.quantity ?? null;

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: invoiceId,
		stripe_id: stripeLineItem.id,
		stripe_invoice_id: stripeInvoiceId,
		stripe_subscription_item_id: stripeSubscriptionItemId,
		stripe_product_id: (priceDetails?.product as string) ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeLineItem.discountable,

		amount,
		amount_after_discounts: amountAfterDiscounts,
		currency: stripeLineItem.currency,

		stripe_quantity: stripeQuantity,
		total_quantity: stripeQuantity, // No billing units without Autumn context
		paid_quantity: stripeQuantity,

		description: stripeLineItem.description ?? "",
		description_source: "stripe",
		direction: stripeLineItem.amount >= 0 ? "charge" : "refund",
		billing_timing: null,
		prorated: false,

		// Extract from metadata if available
		price_id: metadata?.autumn_price_id ?? null,
		customer_product_ids: [], // No Autumn context - empty array
		customer_price_ids: [], // No Autumn context - empty array
		customer_entitlement_ids: [], // No Autumn context - empty array
		internal_product_id: null,
		product_id: metadata?.autumn_product_id ?? null,
		internal_feature_id: null,
		feature_id: null,

		effective_period_start: secondsToMs(stripeLineItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeLineItem.period?.end) ?? null,

		discounts: stripeDiscountsToDbDiscounts({
			discountAmounts: stripeLineItem.discount_amounts,
			currency: stripeLineItem.currency,
		}),
	};
};
