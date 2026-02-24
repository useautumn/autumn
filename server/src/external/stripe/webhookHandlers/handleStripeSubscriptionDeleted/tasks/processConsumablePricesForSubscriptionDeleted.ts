import { customerProductsToProducts, secondsToMs } from "@autumn/shared";
import {
	stripeSubscriptionHasMeteredItems,
	wasImmediateStripeCancellation,
} from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/**
 * Checks if the subscription was canceled during/at trial end.
 * When a trialing subscription is canceled at period end, `ended_at` equals `trial_end`.
 * In this case, we should skip arrear charges since trial usage is free.
 */
const wasTrialCancellation = (
	stripeSubscription: StripeSubscriptionDeletedContext["stripeSubscription"],
): boolean => {
	const trialEnd = stripeSubscription.trial_end;
	const endedAt = stripeSubscription.ended_at;

	if (!trialEnd || !endedAt) return false;

	// If ended_at equals trial_end, the subscription was canceled at trial end
	return trialEnd === endedAt;
};

/**
 * Creates a single invoice for all usage-based (arrear) prices across all customer products
 * when a subscription is deleted.
 *
 * Skips creating an arrear invoice if:
 * 1. The subscription has metered items (Stripe handles metered billing automatically)
 * 2. The cancellation was immediate (not end-of-period) - we don't charge overage on immediate cancels
 * 3. The subscription was canceled at trial end - trial usage is free
 *
 * Note: Autumn-initiated deletions are filtered out before this via the lock mechanism
 * in setupStripeSubscriptionDeletedContext.
 */
export const processConsumablePricesForSubscriptionDeleted = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { stripeSubscription, fullCustomer, customerProducts } = eventContext;

	// Skip if subscription has metered items - Stripe handles metered billing automatically
	if (stripeSubscriptionHasMeteredItems(stripeSubscription)) return;

	// Skip if this was an immediate cancellation (not end-of-period)
	// We only bill arrear usage when the subscription naturally ends at period end
	// This matches the behavior of customer-level consumables (metered) where
	// Stripe also doesn't charge overage on immediate cancels
	if (wasImmediateStripeCancellation(stripeSubscription)) return;

	// Skip if the subscription was canceled at trial end - trial usage is free
	if (wasTrialCancellation(stripeSubscription)) {
		ctx.logger.info(
			"[subscription.deleted] Subscription canceled at trial end, skipping consumable charges",
		);
		return;
	}

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

	if (lineItems.length > 0) {
		// 2. Create, finalize, and pay a single invoice with all line items
		const invoiceLines = lineItemsToInvoiceAddLinesParams({ lineItems });

		const { paid, invoice } = await createInvoiceForBilling({
			ctx,
			billingContext,
			stripeInvoiceAction: {
				addLineParams: { lines: invoiceLines },
			},
		});

		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: invoice,
			fullProducts: customerProductsToProducts({ customerProducts }),
			fullCustomer,
		});

		if (!paid) return;
	}

	// 4. Reset usage balances for all affected customer entitlements (only if payment succeeded)
	await CusEntService.batchUpdate({
		ctx,
		data: updateCustomerEntitlements,
	});
};
