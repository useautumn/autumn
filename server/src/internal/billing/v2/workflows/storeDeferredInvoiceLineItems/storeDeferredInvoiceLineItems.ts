import { generateKsuid } from "@autumn/ksuid";
import {
	type InsertDbInvoiceLineItem,
	type InvoiceLineItemDiscount,
	type LineItem,
	LineItemSchema,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingLineItemsToDbEntities } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/billingLineItemsToDbEntities";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";
import type { StoreDeferredInvoiceLineItemsPayload } from "@/queue/workflows";

type StripeInvoiceItemLike = {
	id: string;
	amount: number;
	currency: string;
	quantity?: number | null;
	description?: string | null;
	discountable: boolean;
	metadata?: Record<string, string>;
	pricing?: {
		price_details?: {
			product?: string;
			price?: string;
		};
	};
	period?: {
		start?: number;
		end?: number;
	};
};

export const storeDeferredInvoiceLineItems = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: StoreDeferredInvoiceLineItemsPayload;
}): Promise<void> => {
	const { deferredStripeInvoiceItems, billingLineItems } = payload;
	try {
		if (!deferredStripeInvoiceItems?.length || !billingLineItems?.length) {
			ctx.logger.debug(
				"[storeDeferredInvoiceLineItems] No deferred items to store",
			);
			return;
		}

		const deferredLineItems = billingLineItems
			.map((item) => {
				const result = LineItemSchema.safeParse(item);
				return result.success ? result.data : null;
			})
			.filter(
				(item): item is LineItem => item !== null && !item.chargeImmediately,
			);

		if (deferredLineItems.length === 0) {
			ctx.logger.debug(
				"[storeDeferredInvoiceLineItems] No deferred billing line items found",
			);
			return;
		}

		await storeDeferredLineItems({
			ctx,
			stripeInvoiceItems: deferredStripeInvoiceItems,
			deferredLineItems,
		});
	} catch (error) {
		ctx.logger.error(
			`[storeDeferredInvoiceLineItems] Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return;
	}
};

const storeDeferredLineItems = async ({
	ctx,
	stripeInvoiceItems,
	deferredLineItems,
}: {
	ctx: AutumnContext;
	stripeInvoiceItems: unknown[];
	deferredLineItems: LineItem[];
}) => {
	const items = stripeInvoiceItems as StripeInvoiceItemLike[];

	const lineItemById = new Map<string, LineItem>();
	for (const li of deferredLineItems) {
		lineItemById.set(li.id, li);
	}

	const dbLineItems: InsertDbInvoiceLineItem[] = [];

	for (const stripeItem of items) {
		const autumnLineItemId = stripeItem.metadata?.autumn_line_item_id;
		const matchedLineItem = autumnLineItemId
			? lineItemById.get(autumnLineItemId)
			: undefined;

		if (matchedLineItem) {
			dbLineItems.push(
				deferredInvoiceItemToDbLineItem({
					stripeItem,
					billingLineItem: matchedLineItem,
				}),
			);
		} else {
			dbLineItems.push(
				deferredInvoiceItemToDbLineItemStripeOnly({ stripeItem }),
			);
		}
	}

	if (dbLineItems.length > 0) {
		await invoiceLineItemRepo.insertMany({
			db: ctx.db,
			lineItems: dbLineItems,
		});

		ctx.logger.info(
			`[storeDeferredInvoiceLineItems] Stored ${dbLineItems.length} deferred line items`,
		);
	}
};

const deferredInvoiceItemToDbLineItem = ({
	stripeItem,
	billingLineItem,
}: {
	stripeItem: StripeInvoiceItemLike;
	billingLineItem: LineItem;
}): InsertDbInvoiceLineItem => {
	const { context } = billingLineItem;
	const priceDetails = stripeItem.pricing?.price_details;

	const autumnDiscountable = context.discountable ?? true;
	const hasAutumnDiscounts =
		!autumnDiscountable && billingLineItem.discounts.length > 0;

	let amount: number;
	let amountAfterDiscounts: number;
	let discounts: InvoiceLineItemDiscount[];

	if (hasAutumnDiscounts) {
		amount = billingLineItem.amount;
		amountAfterDiscounts = billingLineItem.amountAfterDiscounts;
		discounts = billingLineItem.discounts.map((d) => ({
			amount_off: d.amountOff,
			percent_off: d.percentOff,
			stripe_coupon_id: d.stripeCouponId,
		}));
	} else {
		amount = stripeToAtmnAmount({
			amount: stripeItem.amount,
			currency: stripeItem.currency,
		});
		amountAfterDiscounts = amount;
		discounts = [];
	}

	const stripeQuantity = stripeItem.quantity ?? null;

	const totalQuantity = billingLineItem.totalQuantity ?? null;
	const paidQuantity = billingLineItem.paidQuantity ?? null;

	const customerProductIds = context.customerProduct?.id
		? [context.customerProduct.id]
		: [];
	const customerPriceIds = context.customerPrice?.id
		? [context.customerPrice.id]
		: [];
	const customerEntitlementIds = context.customerEntitlement?.id
		? [context.customerEntitlement.id]
		: [];

	return {
		id: billingLineItem.id,
		invoice_id: null,

		stripe_id: stripeItem.id,
		stripe_invoice_id: null,
		stripe_invoice_item_id: stripeItem.id,
		stripe_subscription_item_id: null,
		stripe_product_id:
			priceDetails?.product ?? stripeItem.metadata?.stripe_product_id ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeItem.discountable,

		amount,
		amount_after_discounts: amountAfterDiscounts,
		currency: stripeItem.currency,

		stripe_quantity: stripeQuantity,
		total_quantity: totalQuantity,
		paid_quantity: paidQuantity,

		discounts,

		description: billingLineItem.description ?? "",
		description_source: "autumn",
		direction: context.direction,
		billing_timing: context.billingTiming,
		prorated: billingLineItem.prorated,

		price_id: context.price.id,
		customer_product_ids: customerProductIds,
		customer_price_ids: customerPriceIds,
		customer_entitlement_ids: customerEntitlementIds,
		entities: billingLineItemsToDbEntities({
			billingLineItems: [billingLineItem],
		}),
		internal_product_id: context.product.internal_id,
		product_id: context.product.id,
		internal_feature_id: context.feature?.internal_id ?? null,
		feature_id: context.feature?.id ?? null,

		effective_period_start: secondsToMs(stripeItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeItem.period?.end) ?? null,
	};
};

const deferredInvoiceItemToDbLineItemStripeOnly = ({
	stripeItem,
}: {
	stripeItem: StripeInvoiceItemLike;
}): InsertDbInvoiceLineItem => {
	const metadata = stripeItem.metadata;
	const priceDetails = stripeItem.pricing?.price_details;

	const amount = stripeToAtmnAmount({
		amount: stripeItem.amount,
		currency: stripeItem.currency,
	});

	const stripeQuantity = stripeItem.quantity ?? null;

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: null,

		stripe_id: stripeItem.id,
		stripe_invoice_id: null,
		stripe_invoice_item_id: stripeItem.id,
		stripe_subscription_item_id: null,
		stripe_product_id:
			priceDetails?.product ?? metadata?.stripe_product_id ?? null,
		stripe_price_id: priceDetails?.price ?? null,
		stripe_discountable: stripeItem.discountable,

		amount,
		amount_after_discounts: amount,
		currency: stripeItem.currency,

		stripe_quantity: stripeQuantity,
		total_quantity: stripeQuantity,
		paid_quantity: stripeQuantity,

		description: stripeItem.description ?? "",
		description_source: "stripe",
		direction: stripeItem.amount >= 0 ? "charge" : "refund",
		billing_timing: null,
		prorated: false,

		price_id: metadata?.autumn_price_id ?? null,
		customer_product_ids: [],
		customer_price_ids: [],
		customer_entitlement_ids: [],
		internal_product_id: null,
		product_id: metadata?.autumn_product_id ?? null,
		internal_feature_id: null,
		feature_id: null,

		effective_period_start: secondsToMs(stripeItem.period?.start) ?? null,
		effective_period_end: secondsToMs(stripeItem.period?.end) ?? null,

		discounts: [],
	};
};
