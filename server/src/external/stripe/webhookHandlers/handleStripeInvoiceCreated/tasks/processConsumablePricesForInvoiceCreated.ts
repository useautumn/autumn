import { createHash } from "node:crypto";
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
import { lineItemsToCreateInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

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
	const stripeLineItems =
		invoiceCreditLineItems.length > 0
			? await getStripeInvoiceLineItems({
					stripeClient: ctx.stripeCli,
					invoiceId: stripeInvoice.id,
				})
			: [];
	const existingAutumnLineItemIds = new Set(
		stripeLineItems
			.map((lineItem) => lineItem.metadata?.autumn_line_item_id)
			.filter((lineItemId): lineItemId is string => Boolean(lineItemId)),
	);
	const pendingInvoiceCreditLineItems = invoiceCreditLineItems.filter(
		(lineItem) => !existingAutumnLineItemIds.has(lineItem.id),
	);

	if (disableOverageBilling && consumableLineItems.length > 0) {
		addToExtraLogs({ ctx, extras: { overageBillingDisabledByConfig: true } });
	}
	if (consumableLineItems.length > 0 && !disableOverageBilling) {
		await createStripeInvoiceItems({
			ctx,
			invoiceItems: lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: eventContext.stripeCustomer.id,
				stripeInvoiceId: stripeInvoice.id,
				lineItems: consumableLineItems,
			}),
		});
	}
	if (pendingInvoiceCreditLineItems.length > 0) {
		await createStripeInvoiceItems({
			ctx,
			invoiceItems: lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: eventContext.stripeCustomer.id,
				stripeInvoiceId: stripeInvoice.id,
				lineItems: pendingInvoiceCreditLineItems,
			}),
			idempotencyKeys: pendingInvoiceCreditLineItems.map(
				(lineItem) =>
					`autumn:invoice-credit:${createHash("sha256")
						.update(lineItem.id)
						.digest("hex")}`,
			),
		});
	}

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
