import {
	atmnToStripeAmount,
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
import { lineItemToMetadata } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToMetadata";
import {
	addStripeInvoiceLines,
	createStripeInvoiceItems,
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

type ExistingAutumnLine = { stripeLineItemId: string; billedAmount?: string };

type ExistingAutumnLines = {
	byLineItemId: Map<string, ExistingAutumnLine>;
	/** Usage lines written before ids were invoice-scoped, keyed by customer price. */
	legacyByCustomerPriceId: Map<string, ExistingAutumnLine>;
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
	const legacyByCustomerPriceId = new Map<string, ExistingAutumnLine>();
	for (const stripeLineItem of stripeLineItems) {
		const autumnLineItemId = stripeLineItem.metadata?.autumn_line_item_id;
		if (!autumnLineItemId) continue;
		const existing: ExistingAutumnLine = {
			stripeLineItemId: stripeLineItem.id,
			billedAmount: stripeLineItem.metadata?.autumn_line_amount,
		};
		byLineItemId.set(autumnLineItemId, existing);

		const customerPriceId = stripeLineItem.metadata?.autumn_customer_price_id;
		const isScoped =
			autumnLineItemId.startsWith(USAGE_LINE_ID_PREFIX) ||
			autumnLineItemId.startsWith(CREDIT_LINE_ID_PREFIX);
		if (customerPriceId && !isScoped) {
			legacyByCustomerPriceId.set(customerPriceId, existing);
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
	return customerPriceId
		? existingLines.legacyByCustomerPriceId.get(customerPriceId)
		: undefined;
};

const isExistingLineStale = ({
	lineItem,
	existing,
}: {
	lineItem: LineItem;
	existing: ExistingAutumnLine;
}): boolean => {
	if (existing.billedAmount === undefined) return false;
	const currentAmount = lineItemToMetadata({ lineItem }).autumn_line_amount;
	return String(currentAmount) !== existing.billedAmount;
};

const carryLineItemId = (lineItem: LineItem) => `${lineItem.id}_carry`;

const hasPendingCarryItem = async ({
	ctx,
	stripeCustomerId,
	carryId,
}: {
	ctx: StripeWebhookContext;
	stripeCustomerId: string;
	carryId: string;
}): Promise<boolean> => {
	for await (const invoiceItem of ctx.stripeCli.invoiceItems.list({
		customer: stripeCustomerId,
		pending: true,
		limit: 100,
	})) {
		if (invoiceItem.metadata?.autumn_line_item_id === carryId) return true;
	}
	return false;
};

/**
 * The invoice is finalized, so the unbilled delta is added as a pending
 * invoice item that Stripe picks up on the customer's next invoice.
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
	const currentAmount = Number(
		lineItemToMetadata({ lineItem }).autumn_line_amount,
	);
	const delta = currentAmount - Number(existing.billedAmount);
	if (!(delta > 0)) {
		ctx.logger.error(
			`[invoice.created] Line ${lineItem.id} on finalized invoice ${stripeInvoice.id} was billed at ${existing.billedAmount} but is now ${currentAmount}; nothing to carry forward, needs manual review`,
		);
		return;
	}

	const carryId = carryLineItemId(lineItem);
	if (
		await hasPendingCarryItem({
			ctx,
			stripeCustomerId: stripeCustomer.id,
			carryId,
		})
	) {
		ctx.logger.info(
			`[invoice.created] Unbilled delta for ${lineItem.id} already pending as ${carryId}`,
		);
		return;
	}

	const { currency, discountable } = lineItem.context;
	ctx.logger.warn(
		`[invoice.created] Invoice ${stripeInvoice.id} is finalized; carrying ${delta} ${currency} of unbilled usage for ${lineItem.id} to the next invoice as ${carryId}`,
	);
	await createStripeInvoiceItems({
		ctx,
		invoiceItems: [
			{
				customer: stripeCustomer.id,
				subscription: stripeSubscriptionId,
				amount: atmnToStripeAmount({ amount: delta, currency }),
				currency,
				description: `${lineItem.description} (usage billed after the invoice was finalized)`,
				discountable: discountable ?? false,
				metadata: {
					...lineItemToMetadata({ lineItem }),
					autumn_line_item_id: carryId,
					autumn_line_amount: String(delta),
				},
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
			`[invoice.created] Updating stale line ${lineItem.id} on ${stripeInvoice.id} from ${existing.billedAmount} to ${lineItem.amount}`,
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
