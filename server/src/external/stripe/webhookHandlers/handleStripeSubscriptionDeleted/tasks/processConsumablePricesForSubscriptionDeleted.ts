import { customerProductsToProducts, secondsToMs } from "@autumn/shared";
import { stripeSubscriptionHasMeteredItems } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/**
 * Creates a single invoice for all usage-based (arrear) prices across all customer products
 * when a subscription is deleted.
 * Skips if the deletion was initiated by Autumn (e.g., during an upgrade flow).
 */
export const processConsumablePricesForSubscriptionDeleted = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { db } = ctx;
	const { stripeSubscription, fullCustomer, customerProducts } = eventContext;

	// Check upcoming invoice
	if (stripeSubscriptionHasMeteredItems(stripeSubscription)) return;

	// 1. Generate arrear line items
	// Use ended_at (when subscription was actually deleted) as the period end.
	// This handles mid-cycle cancellations correctly - we bill up to when they canceled,
	// not up to when the cycle would have ended.
	// Falls back to nowMs if ended_at is not available.
	const { lineItems, updateCustomerEntitlements, billingContext } =
		eventContextToArrearLineItems({
			ctx,
			eventContext,
			periodEndMs: stripeSubscription.ended_at
				? secondsToMs(stripeSubscription.ended_at)
				: undefined,
			// No cusEntFilter - bill all consumable entitlements on cancellation
		});

	if (lineItems.length === 0) return;

	// 2. Create, finalize, and pay a single invoice with all line items
	const invoiceLines = lineItemsToInvoiceAddLinesParams({ lineItems });

	const { paid, invoice } = await createInvoiceForBilling({
		ctx,
		billingContext,
		stripeInvoiceAction: {
			addLineParams: { lines: invoiceLines },
		},
	});

	if (!paid) return;

	// 4. Reset usage balances for all affected customer entitlements (only if payment succeeded)
	await CusEntService.batchUpdate({
		db,
		data: updateCustomerEntitlements,
	});

	await upsertInvoiceFromBilling({
		ctx,
		stripeInvoice: invoice,
		fullProducts: customerProductsToProducts({ customerProducts }),
		fullCustomer,
	});
};
