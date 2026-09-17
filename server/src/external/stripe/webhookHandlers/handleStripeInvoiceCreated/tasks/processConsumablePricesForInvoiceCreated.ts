import {
	atmnToStripeAmount,
	customerEntitlementShouldBeBilled,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithProduct,
	isCustomerEntitlementDueAtInvoice,
	type LineItem,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getLatestPeriodStart } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import {
	addStripeInvoiceLines,
	createStripeInvoiceItems,
	updateStripeInvoiceItem,
	updateStripeInvoiceLine,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

const STRIPE_ADD_LINES_MAX_PER_REQUEST = 100;

/**
 * Checks if the subscription's trial just ended.
 * When a trial ends, Stripe creates the first real billing period where
 * `current_period_start` equals `trial_end`. In this case, we should skip
 * billing for consumable usage since trial usage is free.
 */
const hasTrialJustEnded = ({
	stripeSubscription,
}: {
	stripeSubscription: InvoiceCreatedContext["stripeSubscription"];
}): boolean => {
	const trialEnd = stripeSubscription.trial_end;
	if (!trialEnd) return false;

	const periodStart = getLatestPeriodStart({ sub: stripeSubscription });
	return trialEnd === periodStart;
};

/**
 * billedMinor is Stripe's gross amount for the line; percentOffFactor is the
 * share of a gross delta the customer still pays after the invoice's percent
 * coupons. Fixed-amount coupons were consumed at finalization and are ignored.
 */
type ExistingAutumnLine = {
	stripeLineItemId: string;
	billedMinor?: number;
	percentOffFactor: number;
};

const lineDiscountPercentOffFactor = (
	stripeLineItem: Awaited<ReturnType<typeof getStripeInvoiceLineItems>>[number],
): number => {
	// The line listing expands `discounts.source.coupon`; the coupon under
	// `discount_amounts` stays an unexpanded id, so read the terms from here.
	let factor = 1;
	for (const discount of stripeLineItem.discounts ?? []) {
		const coupon = discount?.source?.coupon;
		const percentOff =
			coupon && typeof coupon !== "string" ? coupon.percent_off : null;
		if (percentOff != null) factor *= 1 - percentOff / 100;
	}
	return factor;
};

type ExistingAutumnLines = {
	byLineItemId: Map<string, ExistingAutumnLine>;
	/** Usage lines written before ids were invoice-scoped, keyed by customer price. */
	legacyByCustomerPriceId: Map<string, ExistingAutumnLine[]>;
};

const USAGE_LINE_ID_PREFIX = "invoice_li_usage_";
const CREDIT_LINE_ID_PREFIX = "invoice_li_credit_";

const getExistingAutumnLines = async ({
	ctx,
	invoiceId,
}: {
	ctx: StripeWebhookContext;
	invoiceId: string;
}): Promise<ExistingAutumnLines> => {
	const stripeLineItems = await getStripeInvoiceLineItems({
		stripeClient: ctx.stripeCli,
		invoiceId,
	});
	const byLineItemId = new Map<string, ExistingAutumnLine>();
	const legacyByCustomerPriceId = new Map<string, ExistingAutumnLine[]>();
	for (const stripeLineItem of stripeLineItems) {
		const autumnLineItemId = stripeLineItem.metadata?.autumn_line_item_id;
		if (!autumnLineItemId) continue;
		const existing: ExistingAutumnLine = {
			stripeLineItemId: stripeLineItem.id,
			billedMinor:
				typeof stripeLineItem.amount === "number"
					? stripeLineItem.amount
					: undefined,
			percentOffFactor: lineDiscountPercentOffFactor(stripeLineItem),
		};
		byLineItemId.set(autumnLineItemId, existing);

		const customerPriceId = stripeLineItem.metadata?.autumn_customer_price_id;
		const isScoped =
			autumnLineItemId.startsWith(USAGE_LINE_ID_PREFIX) ||
			autumnLineItemId.startsWith(CREDIT_LINE_ID_PREFIX);
		if (customerPriceId && !isScoped) {
			legacyByCustomerPriceId.set(customerPriceId, [
				...(legacyByCustomerPriceId.get(customerPriceId) ?? []),
				existing,
			]);
		}
	}
	return { byLineItemId, legacyByCustomerPriceId };
};

const findExistingLine = ({
	lineItem,
	existingLines,
}: {
	lineItem: LineItem;
	existingLines: ExistingAutumnLines;
}): ExistingAutumnLine | undefined => {
	const byId = existingLines.byLineItemId.get(lineItem.id);
	if (byId) return byId;
	if (!lineItem.id.startsWith(USAGE_LINE_ID_PREFIX)) return undefined;
	const customerPriceId = lineItem.context.customerPrice?.id;
	const legacyLines = customerPriceId
		? (existingLines.legacyByCustomerPriceId.get(customerPriceId) ?? [])
		: [];
	if (legacyLines.length > 1) {
		throw new Error(
			`[invoice.created] ${legacyLines.length} usage lines already exist for customer price ${customerPriceId}; the invoice needs manual reconciliation before balances can be reset`,
		);
	}
	return legacyLines[0];
};

const lineItemMinorAmount = (lineItem: LineItem): number => {
	const { amount, amountAfterDiscounts, context } = lineItem;
	const { currency, discountable } = context;
	return atmnToStripeAmount({
		amount: discountable ? amount : amountAfterDiscounts,
		currency,
	});
};

const isExistingLineStale = ({
	lineItem,
	existing,
}: {
	lineItem: LineItem;
	existing: ExistingAutumnLine;
}): boolean =>
	existing.billedMinor !== undefined &&
	lineItemMinorAmount(lineItem) !== existing.billedMinor;

const carryLineItemId = (lineItem: LineItem) => `${lineItem.id}_carry`;

const findPendingCarryItem = async ({
	ctx,
	stripeCustomerId,
	carryId,
}: {
	ctx: StripeWebhookContext;
	stripeCustomerId: string;
	carryId: string;
}): Promise<{ id: string; amount: number } | undefined> => {
	for await (const invoiceItem of ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
		pending: true,
		limit: 100,
	})) {
		if (invoiceItem.metadata?.autumn_line_item_id === carryId) {
			return { id: invoiceItem.id, amount: invoiceItem.amount };
		}
	}
	return undefined;
};

/**
 * The invoice is finalized, so the difference between what it billed and
 * what the line is worth now becomes a pending invoice item for the next
 * invoice. Percent coupons from the finalized invoice still apply to the
 * delta, fixed-amount coupons were already consumed, and the item is not
 * discountable again so next cycle's coupons cannot touch it. Negative
 * deltas (a credit line that grew) are carried the same way.
 */
const carryUnbilledDeltaForward = async ({
	ctx,
	eventContext,
	lineItem,
	existing,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	lineItem: LineItem;
	existing: ExistingAutumnLine;
}) => {
	const { stripeInvoice, stripeCustomer, stripeSubscriptionId } = eventContext;
	if (existing.billedMinor === undefined) return;
	const deltaGrossMinor = lineItemMinorAmount(lineItem) - existing.billedMinor;
	if (deltaGrossMinor === 0) return;

	const deltaMinor = Math.round(deltaGrossMinor * existing.percentOffFactor);
	if (deltaMinor === 0) return;

	const { currency } = lineItem.context;
	const deltaAmount = stripeToAtmnAmount({ amount: deltaMinor, currency });
	const carryId = carryLineItemId(lineItem);
	// Only the carry id and amount: price and customer-price ids would let the
	// next invoice's line storage mistake this item for that cycle's usage line.
	const metadata = {
		autumn_line_item_id: carryId,
		autumn_line_amount: String(deltaAmount),
	};

	const pending = await findPendingCarryItem({
		ctx,
		stripeCustomerId: stripeCustomer.id,
		carryId,
	});
	if (pending?.amount === deltaMinor) {
		ctx.logger.info(
			`[invoice.created] Unbilled delta for ${lineItem.id} already pending as ${carryId}`,
		);
		return;
	}
	if (pending) {
		ctx.logger.warn(
			`[invoice.created] Invoice ${stripeInvoice.id} is finalized; updating pending ${carryId} from ${pending.amount} to ${deltaMinor} minor units`,
		);
		await updateStripeInvoiceItem({
			stripeCli: ctx.stripeCli,
			invoiceItemId: pending.id,
			params: { amount: deltaMinor, metadata },
		});
		return;
	}

	ctx.logger.warn(
		`[invoice.created] Invoice ${stripeInvoice.id} is finalized; carrying ${deltaAmount} ${currency} of unbilled usage for ${lineItem.id} to the next invoice as ${carryId}`,
	);
	await createStripeInvoiceItems({
		ctx,
		invoiceItems: [
			{
				customer: stripeCustomer.id,
				subscription: stripeSubscriptionId,
				amount: deltaMinor,
				currency,
				description: `${lineItem.description} (usage billed after the invoice was finalized)`,
				discountable: false,
				metadata,
			},
		],
	});
};

/**
 * A retry can find a line that was written by an earlier attempt whose reset
 * never ran; usage tracked since then changed the amount. On a draft the line
 * is updated so the reset stays correct; on a finalized invoice the delta is
 * carried to the next invoice as a pending item before the reset proceeds.
 */
const reconcileStaleExistingLines = async ({
	ctx,
	eventContext,
	lineItems,
	existingLines,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	lineItems: LineItem[];
	existingLines: ExistingAutumnLines;
}) => {
	const { stripeInvoice } = eventContext;
	for (const lineItem of lineItems) {
		const existing = findExistingLine({ lineItem, existingLines });
		if (!existing || !isExistingLineStale({ lineItem, existing })) continue;

		if (stripeInvoice.status !== "draft") {
			await carryUnbilledDeltaForward({
				ctx,
				eventContext,
				lineItem,
				existing,
			});
			continue;
		}

		const [params] = lineItemsToInvoiceAddLinesParams({
			lineItems: [lineItem],
		});
		if (!params) continue;
		ctx.logger.info(
			`[invoice.created] Updating stale line ${lineItem.id} on ${stripeInvoice.id} from ${existing.billedMinor} to ${lineItemMinorAmount(lineItem)} minor units`,
		);
		await updateStripeInvoiceLine({
			stripeCli: ctx.stripeCli,
			invoiceId: stripeInvoice.id,
			lineItemId: existing.stripeLineItemId,
			params,
		});
	}
};

const addPendingLineItemsToInvoice = async ({
	ctx,
	eventContext,
	lineItems,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	lineItems: LineItem[];
}) => {
	const { stripeInvoice } = eventContext;
	if (lineItems.length === 0) return;

	const existingLines = await getExistingAutumnLines({
		ctx,
		invoiceId: stripeInvoice.id,
	});
	await reconcileStaleExistingLines({
		ctx,
		eventContext,
		lineItems,
		existingLines,
	});
	const pendingLineItems = lineItems.filter(
		(lineItem) => !findExistingLine({ lineItem, existingLines }),
	);

	if (pendingLineItems.length === 0) {
		ctx.logger.info(
			`[invoice.created] All ${lineItems.length} line items already on ${stripeInvoice.id}, skipping creation`,
		);
		return;
	}

	if (stripeInvoice.status !== "draft") {
		throw new Error(
			`[invoice.created] Invoice ${stripeInvoice.id} is no longer a draft (${stripeInvoice.status}) but ${pendingLineItems.length} of ${lineItems.length} Autumn line items are missing; skipping balance resets`,
		);
	}

	if (pendingLineItems.length < lineItems.length) {
		ctx.logger.info(
			`[invoice.created] Retry detected for ${stripeInvoice.id}: ${lineItems.length - pendingLineItems.length} line items already present, adding ${pendingLineItems.length}`,
		);
	}

	const batches: LineItem[][] = [];
	for (
		let start = 0;
		start < pendingLineItems.length;
		start += STRIPE_ADD_LINES_MAX_PER_REQUEST
	) {
		batches.push(
			pendingLineItems.slice(start, start + STRIPE_ADD_LINES_MAX_PER_REQUEST),
		);
	}

	let updatedInvoice: Awaited<ReturnType<typeof addStripeInvoiceLines>> | null =
		null;
	for (const batch of batches) {
		updatedInvoice = await addStripeInvoiceLines({
			stripeCli: ctx.stripeCli,
			invoiceId: stripeInvoice.id,
			lines: lineItemsToInvoiceAddLinesParams({ lineItems: batch }),
		});
	}

	const returnedLines =
		batches.length === 1 && updatedInvoice && !updatedInvoice.lines.has_more
			? updatedInvoice.lines.data
			: null;
	const landedAutumnLineItemIds = returnedLines
		? new Set(
				returnedLines
					.map((lineItem) => lineItem.metadata?.autumn_line_item_id)
					.filter((lineItemId): lineItemId is string => Boolean(lineItemId)),
			)
		: new Set(
				(
					await getExistingAutumnLines({ ctx, invoiceId: stripeInvoice.id })
				).byLineItemId.keys(),
			);
	const missingLineItemIds = pendingLineItems
		.map((lineItem) => lineItem.id)
		.filter((lineItemId) => !landedAutumnLineItemIds.has(lineItemId));
	if (missingLineItemIds.length > 0) {
		throw new Error(
			`[invoice.created] addLines on ${stripeInvoice.id} returned without ${missingLineItemIds.length} requested line items (${missingLineItemIds.join(", ")}); skipping balance resets`,
		);
	}
};

/**
 * Processes consumable (usage-in-arrear) prices for an invoice.
 * Adds usage line items to the invoice for the billing period.
 *
 * Returns the generated arrear line items so they can be used for matching
 * during line item storage.
 *
 * TODO: Handle conflict with entity consumable prices (Case B)
 * When a customer cancels end-of-cycle with entity-level consumables:
 * - subscription.deleted fires → creates arrear invoice via createInvoiceForArrearPrices
 * - invoice.created also fires → may try to add line items here
 * Risk: Double billing for entity-level consumables
 * Need to coordinate between the two handlers to prevent this.
 */
export const processConsumablePricesForInvoiceCreated = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<LineItem[]> => {
	const { stripeInvoice, stripeSubscription } = eventContext;

	const isPeriodicInvoice =
		stripeInvoice.billing_reason === "subscription_cycle";

	const trialJustEnded = hasTrialJustEnded({ stripeSubscription });

	if (!isPeriodicInvoice) return [];

	const invoicePeriodEndMs = secondsToMs(stripeInvoice.period_end);
	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	const consumableCustomerEntitlementFilter = (
		cusEnt: FullCusEntWithFullCusProduct,
	) =>
		customerEntitlementShouldBeBilled({
			cusEnt,
			invoicePeriodEndMs,
			billingCycleAnchorMs,
		});
	const invoiceCreditCustomerEntitlementFilter = (
		customerEntitlement: FullCusEntWithFullCusProduct,
	) =>
		isCustomerEntitlementDueAtInvoice({
			customerEntitlement,
			invoicePeriodEndMs,
		});
	const disableOverageBilling = shouldDisableOverageBilling({
		org: ctx.org,
		customerId: eventContext.fullCustomer.id,
		customerConfig: eventContext.fullCustomer.config,
	});

	if (trialJustEnded) {
		ctx.logger.info(
			"[invoice.created] Trial just ended, skipping consumable charges",
		);
	}

	const {
		lineItems: consumableLineItems,
		invoiceCreditLineItems,
		updateCustomerEntitlements,
	} = await eventContextToArrearLineItems({
		ctx,
		eventContext,
		periodEndMs: invoicePeriodEndMs,
		idempotencyScope: stripeInvoice.id,
		cusEntFilter: trialJustEnded
			? () => false
			: consumableCustomerEntitlementFilter,
		invoiceCredits: {
			cusEntFilter: invoiceCreditCustomerEntitlementFilter,
			idempotencyScope: stripeInvoice.id,
			fullyOffsetOverage: disableOverageBilling,
			includeLineItems: !trialJustEnded,
		},
	});

	if (disableOverageBilling && consumableLineItems.length > 0) {
		addToExtraLogs({ ctx, extras: { overageBillingDisabledByConfig: true } });
	}

	await addPendingLineItemsToInvoice({
		ctx,
		eventContext,
		lineItems: [
			...(disableOverageBilling ? [] : consumableLineItems),
			...invoiceCreditLineItems,
		],
	});

	await CusEntService.batchUpdate({
		ctx,
		data: updateCustomerEntitlements,
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId:
			eventContext.fullCustomer.id ?? eventContext.fullCustomer.internal_id,
		source: "invoice-created-consumable-reset",
	});

	await Promise.all(
		updateCustomerEntitlements.map(async (update) => {
			const rolloverUpdates = getRolloverUpdates({
				cusEnt: update.customerEntitlement,
				nextResetAt: invoicePeriodEndMs,
			});

			const fullCusEnt: FullCusEntWithProduct = {
				...update.customerEntitlement,
				customer_product: null,
			};

			await RolloverService.insert({
				ctx,
				rows: rolloverUpdates.toInsert,
				fullCusEnt,
			});
		}),
	);

	return [...consumableLineItems, ...invoiceCreditLineItems];
};
