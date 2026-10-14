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
import { billingLineItemsToDbEntities } from "./billingLineItemsToDbEntities";
import type { StripeLineItemGroup } from "./groupStripeLineItems";
import { stripeDiscountsToDbDiscounts } from "./stripeDiscountsToDbDiscounts";

type SubscriptionItemMetadataMap = Map<string, Stripe.Metadata>;

export const stripeLineItemGroupToDbLineItems = ({
	group,
	stripeDiscounts,
	invoiceId,
	stripeInvoiceId,
	autumnLineItems,
	subscriptionItemMetadata,
}: {
	group: StripeLineItemGroup;
	stripeDiscounts: Stripe.Discount[];
	invoiceId: string;
	stripeInvoiceId: string;
	autumnLineItems: LineItem[];
	subscriptionItemMetadata?: SubscriptionItemMetadataMap;
}): {
	dbLineItems: InsertDbInvoiceLineItem[];
	matchedAutumnLineItems: LineItem[];
} => {
	const representativeLineItem = group.lineItems[0];

	const subItemId =
		representativeLineItem.parent?.subscription_item_details?.subscription_item;
	const subItemMetadata =
		typeof subItemId === "string"
			? subscriptionItemMetadata?.get(subItemId)
			: undefined;

	const matchedLineItems = filterBillingLineItemsByStripeLineItem({
		stripeLineItem: representativeLineItem,
		autumnLineItems,
		subscriptionItemMetadata: subItemMetadata,
	});

	const stripeSubscriptionItemId =
		group.groupType === "subscription_item" ? group.groupKey : null;

	const isMultiItemGroup = group.lineItems.length > 1;

	const dbLineItems = group.lineItems.map((stripeLineItem) => {
		if (matchedLineItems.length > 0) {
			return mergeStripeAndBillingLineItems({
				stripeLineItem,
				stripeDiscounts,
				billingLineItems: matchedLineItems,
				invoiceId,
				stripeInvoiceId,
				stripeSubscriptionItemId,
				isMultiItemGroup,
			});
		}
		return createDbLineItemFromStripeOnly({
			stripeLineItem,
			stripeDiscounts,
			invoiceId,
			stripeInvoiceId,
			stripeSubscriptionItemId,
			subscriptionItemMetadata: subItemMetadata,
		});
	});

	return { dbLineItems, matchedAutumnLineItems: matchedLineItems };
};

const mergeStripeAndBillingLineItems = ({
	stripeLineItem,
	stripeDiscounts,
	billingLineItems,
	invoiceId,
	stripeInvoiceId,
	stripeSubscriptionItemId,
	isMultiItemGroup,
}: {
	stripeLineItem: ExpandedStripeInvoiceLineItem;
	stripeDiscounts: Stripe.Discount[];
	billingLineItems: LineItem[];
	invoiceId: string;
	stripeInvoiceId: string;
	stripeSubscriptionItemId: string | null;
	isMultiItemGroup: boolean;
}): InsertDbInvoiceLineItem => {
	const primaryLineItem = billingLineItems[0];
	const { context } = primaryLineItem;
	const priceDetails = stripeLineItem.pricing?.price_details;
	const stripeProration =
		(stripeLineItem as ExpandedStripeInvoiceLineItem & { proration?: boolean })
			.proration ?? primaryLineItem.prorated;

	// amount to Stripe. So stripeLineItem.amount is already discounted and discount_amounts is empty.
	const autumnDiscountable = context.discountable ?? true;
	const isBackdatedAggregate = context.backdate !== undefined;
	const hasAutumnDiscounts =
		!isBackdatedAggregate &&
		!autumnDiscountable &&
		primaryLineItem.discounts.length > 0;

	let amount: number;
	let amountAfterDiscounts: number;
	let discounts: InvoiceLineItemDiscount[];

	if (hasAutumnDiscounts) {
		amount = billingLineItems.reduce(
			(sum, billingLineItem) => sum + billingLineItem.amount,
			0,
		);
		amountAfterDiscounts = billingLineItems.reduce(
			(sum, billingLineItem) => sum + billingLineItem.amountAfterDiscounts,
			0,
		);
		discounts = primaryLineItem.discounts.map((d) => ({
			amount_off: d.amountOff,
			percent_off: d.percentOff,
			stripe_coupon_id: d.stripeCouponId,
		}));
	} else {
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
			discounts: [...stripeDiscounts, ...stripeLineItem.discounts],
			currency: stripeLineItem.currency,
		});
	}

	const stripeQuantity = stripeLineItem.quantity ?? null;

	let totalQuantity: number | null = null;
	let paidQuantity: number | null = null;

	if (isMultiItemGroup) {
		if (stripeQuantity !== null) {
			const priceConfig = context.price.config as
				| UsagePriceConfig
				| FixedPriceConfig;
			const billingUnits = priceConfig.billing_units ?? 1;
			totalQuantity = stripeQuantity * billingUnits;
			paidQuantity = totalQuantity;
		}
	} else {
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

		if (totalQuantity === null && stripeQuantity !== null) {
			const priceConfig = context.price.config as
				| UsagePriceConfig
				| FixedPriceConfig;
			const billingUnits = priceConfig.billing_units ?? 1;
			totalQuantity = stripeQuantity * billingUnits;
			paidQuantity = totalQuantity;
		}
	}

	const useStripeDescription =
		(isMultiItemGroup || isBackdatedAggregate) &&
		stripeLineItem.description !== null;
	const description = useStripeDescription
		? (stripeLineItem.description as string)
		: (primaryLineItem.description ?? "");
	const descriptionSource = useStripeDescription ? "stripe" : "autumn";

	const customerProductIds = billingLineItems
		.map((li) => li.context.customerProduct?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	const customerPriceIds = billingLineItems
		.map((li) => li.context.customerPrice?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	const customerEntitlementIds = billingLineItems
		.map((li) => li.context.customerEntitlement?.id)
		.filter((id): id is string => id !== undefined && id !== null);

	const entities = isMultiItemGroup
		? []
		: billingLineItemsToDbEntities({ billingLineItems });

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: invoiceId,

		stripe_id: stripeLineItem.id,
		stripe_invoice_id: stripeInvoiceId,
		stripe_invoice_item_id:
			stripeLineItem.parent?.invoice_item_details?.invoice_item ?? null,
		stripe_subscription_item_id: stripeSubscriptionItemId,
		stripe_product_id: (priceDetails?.product as string) ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeLineItem.discountable,

		amount,
		amount_after_discounts: amountAfterDiscounts,
		currency: stripeLineItem.currency,

		stripe_quantity: stripeQuantity,
		total_quantity: totalQuantity,
		paid_quantity: paidQuantity,

		discounts,

		description,
		description_source: descriptionSource,

		direction: context.direction,
		billing_timing: context.billingTiming,
		prorated: stripeProration,

		price_id: context.price.id,
		customer_product_ids: customerProductIds,
		customer_price_ids: customerPriceIds,
		customer_entitlement_ids: customerEntitlementIds,
		entities,
		internal_product_id: context.product.internal_id,
		product_id: context.product.id,
		internal_feature_id: context.feature?.internal_id ?? null,
		feature_id: context.feature?.id ?? null,

		effective_period_start: secondsToMs(stripeLineItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeLineItem.period?.end) ?? null,
	};
};

const createDbLineItemFromStripeOnly = ({
	stripeLineItem,
	stripeDiscounts,
	invoiceId,
	stripeInvoiceId,
	stripeSubscriptionItemId,
	subscriptionItemMetadata,
}: {
	stripeLineItem: ExpandedStripeInvoiceLineItem;
	stripeDiscounts: Stripe.Discount[];
	invoiceId: string;
	stripeInvoiceId: string;
	stripeSubscriptionItemId: string | null;
	subscriptionItemMetadata?: Stripe.Metadata;
}): InsertDbInvoiceLineItem => {
	const metadata = {
		...stripeLineItem.metadata,
		...subscriptionItemMetadata,
	};
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
	const stripeProration =
		(stripeLineItem as ExpandedStripeInvoiceLineItem & { proration?: boolean })
			.proration ?? false;

	const stripeQuantity = stripeLineItem.quantity ?? null;

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: invoiceId,
		stripe_id: stripeLineItem.id,
		stripe_invoice_id: stripeInvoiceId,
		stripe_invoice_item_id:
			stripeLineItem.parent?.invoice_item_details?.invoice_item ?? null,
		stripe_subscription_item_id: stripeSubscriptionItemId,
		stripe_product_id: (priceDetails?.product as string) ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeLineItem.discountable,

		amount,
		amount_after_discounts: amountAfterDiscounts,
		currency: stripeLineItem.currency,

		stripe_quantity: stripeQuantity,
		total_quantity: stripeQuantity,
		paid_quantity: stripeQuantity,

		description: stripeLineItem.description ?? "",
		description_source: "stripe",
		direction: stripeLineItem.amount >= 0 ? "charge" : "refund",
		billing_timing: null,
		prorated: stripeProration,

		price_id: metadata?.autumn_price_id ?? null,
		customer_product_ids: [],
		customer_price_ids: [],
		customer_entitlement_ids: [],
		internal_product_id: null,
		product_id: metadata?.autumn_product_id ?? null,
		internal_feature_id: null,
		feature_id: null,

		effective_period_start: secondsToMs(stripeLineItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeLineItem.period?.end) ?? null,

		discounts: stripeDiscountsToDbDiscounts({
			discountAmounts: stripeLineItem.discount_amounts,
			discounts: [...stripeDiscounts, ...stripeLineItem.discounts],
			currency: stripeLineItem.currency,
		}),
	};
};
