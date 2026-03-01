import {
	customerEntitlementShouldBeBilled,
	type LineItem,
	secondsToMs,
} from "@autumn/shared";
import { getLatestPeriodStart } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import { lineItemsToCreateInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
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

	if (trialJustEnded) {
		ctx.logger.info(
			"[invoice.created] Trial just ended, skipping consumable charges",
		);
		return [];
	}

	const invoicePeriodEndMs = secondsToMs(stripeInvoice.period_end);

	const { lineItems, updateCustomerEntitlements } =
		eventContextToArrearLineItems({
			ctx,
			eventContext,
			periodEndMs: invoicePeriodEndMs,
			// Multi-interval filter: only bill entitlements whose cycle ends at this invoice
			cusEntFilter: (cusEnt) =>
				customerEntitlementShouldBeBilled({
					cusEnt,
					invoicePeriodEndMs,
				}),
		});

	if (lineItems.length > 0) {
		await createStripeInvoiceItems({
			ctx,
			invoiceItems: lineItemsToCreateInvoiceItemsParams({
				stripeCustomerId: eventContext.stripeCustomer.id,
				stripeInvoiceId: stripeInvoice.id,
				lineItems,
			}),
		});
	}

	await CusEntService.batchUpdate({
		ctx,
		data: updateCustomerEntitlements,
	});

	// Handle rollovers
	updateCustomerEntitlements.forEach(async (update) => {
		const rolloverUpdates = getRolloverUpdates({
			cusEnt: update.customerEntitlement,
			nextResetAt: Date.now(),
		});

		await RolloverService.insert({
			ctx,
			rows: rolloverUpdates.toInsert,
			fullCusEnt: update.customerEntitlement,
		});
	});

	return lineItems;
};
