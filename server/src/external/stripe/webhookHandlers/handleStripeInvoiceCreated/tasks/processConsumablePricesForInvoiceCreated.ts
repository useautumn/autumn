import { customerEntitlementShouldBeBilled, secondsToMs } from "@autumn/shared";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import { lineItemsToCreateInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

/**
 * Processes consumable (usage-in-arrear) prices for an invoice.
 * Adds usage line items to the invoice for the billing period.
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
}): Promise<void> => {
	const { stripeInvoice } = eventContext;

	if (stripeInvoice.billing_reason !== "subscription_cycle") return;

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
		db: ctx.db,
		data: updateCustomerEntitlements,
	});
};
