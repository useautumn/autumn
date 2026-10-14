import { customerProductsToProducts, secondsToMs } from "@autumn/shared";
import {
	stripeSubscriptionHasMeteredItems,
	wasImmediateStripeCancellation,
} from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { eventContextToArrearLineItems } from "@/external/stripe/webhookHandlers/common";
import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

const wasTrialCancellation = (
	stripeSubscription: StripeSubscriptionDeletedContext["stripeSubscription"],
): boolean => {
	const trialEnd = stripeSubscription.trial_end;
	const endedAt = stripeSubscription.ended_at;

	if (!trialEnd || !endedAt) return false;

	return trialEnd === endedAt;
};

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

	// Stripe also doesn't charge overage on immediate cancels
	if (wasImmediateStripeCancellation(stripeSubscription)) return;

	if (wasTrialCancellation(stripeSubscription)) {
		ctx.logger.info(
			"[subscription.deleted] Subscription canceled at trial end, skipping consumable charges",
		);
		return;
	}

	const disableOverageBilling = shouldDisableOverageBilling({
		org: ctx.org,
		customerId: eventContext.fullCustomer.id,
		customerConfig: eventContext.fullCustomer.config,
	});

	const {
		lineItems,
		invoiceCreditLineItems,
		updateCustomerEntitlements,
		billingContext,
	} = await eventContextToArrearLineItems({
		ctx,
		eventContext,
		periodEndMs: stripeSubscription.ended_at
			? secondsToMs(stripeSubscription.ended_at)
			: undefined,
		stripeDiscountable: false,
		invoiceCredits: {
			idempotencyScope: stripeSubscription.id,
			fullyOffsetOverage: disableOverageBilling,
		},
	});

	if (disableOverageBilling && lineItems.length > 0) {
		addToExtraLogs({ ctx, extras: { overageBillingDisabledByConfig: true } });
	}
	const invoiceLineItems = [
		...(disableOverageBilling ? [] : lineItems),
		...invoiceCreditLineItems,
	];
	if (invoiceLineItems.length > 0) {
		const invoiceLines = lineItemsToInvoiceAddLinesParams({
			lineItems: invoiceLineItems,
		});

		const { paid, invoice } = await createInvoiceForBilling({
			ctx,
			billingContext,
			stripeInvoiceAction: {
				addLineParams: { lines: invoiceLines },
			},
			options: {
				skipSubscriptionLink: true,
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

	await CusEntService.batchUpdate({
		ctx,
		data: updateCustomerEntitlements,
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId:
			eventContext.fullCustomer.id ?? eventContext.fullCustomer.internal_id,
		source: "subscription-deleted-consumable-reset",
	});
};
