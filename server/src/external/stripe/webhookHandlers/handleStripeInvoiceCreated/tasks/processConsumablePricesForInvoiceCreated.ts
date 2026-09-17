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
import {
	buildInvoiceAddLinesIdempotencyKey,
	getReplayedStripeRequestId,
} from "../utils/buildInvoiceAddLinesIdempotencyKey";

const STRIPE_ADD_LINES_MAX_PER_REQUEST = 100;
// Stripe redelivers a failing webhook ~16 times over 3 days; each cached failure adds one link.
const MAX_REPLAYED_FAILURE_WALK = 16;

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

const observeInvoiceLineItems = async ({
	ctx,
	invoiceId,
	lineItems,
}: {
	ctx: StripeWebhookContext;
	invoiceId: string;
	lineItems: LineItem[];
}) => {
	const existingLineItemIds = await getExistingAutumnLineItemIds({
		ctx,
		invoiceId,
	});
	return {
		existingLineItemIds,
		pendingLineItems: lineItems.filter(
			(lineItem) => !existingLineItemIds.has(lineItem.id),
		),
	};
};

/**
 * One bulk addLines per batch under a key derived from the observed invoice
 * state and the exact request, so the same write dedupes at Stripe while any
 * change gets a fresh key. Stripe caches resource-specific 429s (lock_timeout)
 * and 4xx under a key for 24h (how credit lines went missing before), so a
 * replayed failure re-reads the invoice and retries under the key salted with
 * the replayed request id. Every delivery walks that chain identically, and a
 * fresh failure ends the walk so Stripe redelivers.
 */
const addLineItemBatch = async ({
	ctx,
	invoiceId,
	batch,
	existingLineItemIds,
	salt,
	attempt = 0,
}: {
	ctx: StripeWebhookContext;
	invoiceId: string;
	batch: LineItem[];
	existingLineItemIds: Set<string>;
	salt?: string;
	attempt?: number;
}): Promise<Awaited<ReturnType<typeof addStripeInvoiceLines>> | null> => {
	if (batch.length === 0) return null;
	const lines = lineItemsToInvoiceAddLinesParams({ lineItems: batch });
	try {
		return await addStripeInvoiceLines({
			stripeCli: ctx.stripeCli,
			invoiceId,
			lines,
			idempotencyKey: buildInvoiceAddLinesIdempotencyKey({
				invoiceId,
				existingLineItemIds,
				requestParams: lines,
				salt,
			}),
		});
	} catch (error) {
		const replayedRequestId = getReplayedStripeRequestId(error);
		if (!replayedRequestId || attempt >= MAX_REPLAYED_FAILURE_WALK) {
			throw error;
		}
		ctx.logger.warn(
			`[invoice.created] addLines on ${invoiceId} replayed cached failure from ${replayedRequestId}; retrying with a salted key`,
		);
		const observed = await observeInvoiceLineItems({
			ctx,
			invoiceId,
			lineItems: batch,
		});
		return addLineItemBatch({
			ctx,
			invoiceId,
			batch: observed.pendingLineItems.slice(
				0,
				STRIPE_ADD_LINES_MAX_PER_REQUEST,
			),
			existingLineItemIds: observed.existingLineItemIds,
			salt: replayedRequestId,
			attempt: attempt + 1,
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

	const { existingLineItemIds, pendingLineItems } =
		await observeInvoiceLineItems({
			ctx,
			invoiceId: stripeInvoice.id,
			lineItems,
		});

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

	// Re-observe before every batch so each key reflects the invoice as it is,
	// and an overlapping delivery that saw the earlier batch shares the key.
	const maxBatches =
		Math.ceil(pendingLineItems.length / STRIPE_ADD_LINES_MAX_PER_REQUEST) + 1;
	let observed = { existingLineItemIds, pendingLineItems };
	let updatedInvoice: Awaited<ReturnType<typeof addStripeInvoiceLines>> | null =
		null;
	let batchesSent = 0;
	while (observed.pendingLineItems.length > 0 && batchesSent < maxBatches) {
		const batch = observed.pendingLineItems.slice(
			0,
			STRIPE_ADD_LINES_MAX_PER_REQUEST,
		);
		updatedInvoice = await addLineItemBatch({
			ctx,
			invoiceId: stripeInvoice.id,
			batch,
			existingLineItemIds: observed.existingLineItemIds,
		});
		batchesSent += 1;
		if (batch.length === observed.pendingLineItems.length) break;
		observed = await observeInvoiceLineItems({
			ctx,
			invoiceId: stripeInvoice.id,
			lineItems: pendingLineItems,
		});
	}

	const returnedLines =
		batchesSent === 1 && updatedInvoice && !updatedInvoice.lines.has_more
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
