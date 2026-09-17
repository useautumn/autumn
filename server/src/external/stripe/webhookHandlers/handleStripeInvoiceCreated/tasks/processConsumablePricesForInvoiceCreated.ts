import {
	customerEntitlementShouldBeBilled,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithProduct,
	isCustomerEntitlementDueAtInvoice,
	type LineItem,
	secondsToMs,
} from "@autumn/shared";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getLatestPeriodStart } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { addStripeInvoiceLines } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
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

const getExistingAutumnLineItemIds = async ({
	ctx,
	invoiceId,
}: {
	ctx: StripeWebhookContext;
	invoiceId: string;
}): Promise<Set<string>> => {
	const stripeLineItems = await getStripeInvoiceLineItems({
		stripeClient: ctx.stripeCli,
		invoiceId,
	});
	return new Set(
		stripeLineItems
			.map((lineItem) => lineItem.metadata?.autumn_line_item_id)
			.filter((lineItemId): lineItemId is string => Boolean(lineItemId)),
	);
};

/**
 * Adds every line item not already on the invoice via bulk addLines.
 *
 * Stripe webhook retries re-run this task, so line ids are scoped to the
 * invoice and matched against `metadata.autumn_line_item_id` before sending.
 * Each attempt uses a fresh idempotency key on purpose: Stripe caches
 * resource-specific 429s (lock_timeout) and 4xx under a reused key for 24h,
 * which is how credit lines went missing before. Concurrent deliveries are
 * ruled out by the webhook event lock, which this event requires.
 */
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

	const existingAutumnLineItemIds = await getExistingAutumnLineItemIds({
		ctx,
		invoiceId: stripeInvoice.id,
	});
	const pendingLineItems = lineItems.filter(
		(lineItem) => !existingAutumnLineItemIds.has(lineItem.id),
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
		: await getExistingAutumnLineItemIds({ ctx, invoiceId: stripeInvoice.id });
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
