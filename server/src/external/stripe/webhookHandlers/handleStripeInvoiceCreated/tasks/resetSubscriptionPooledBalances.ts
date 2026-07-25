import {
	isCustomerEntitlementDueAtInvoice,
	PooledBalanceResetMode,
	secondsToMs,
} from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { resetPooledBalances } from "@/internal/billing/v2/pooledBalances/execute/resetPooledBalances.js";

export const resetSubscriptionPooledBalances = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	if (eventContext.stripeInvoice.billing_reason !== "subscription_cycle")
		return;

	const pooledCustomerEntitlements =
		eventContext.fullCustomer.pooled_customer_entitlements ?? [];
	const invoicePeriodEndMs = secondsToMs(eventContext.stripeInvoice.period_end);
	const resettablePooledCustomerEntitlements =
		pooledCustomerEntitlements.filter(
			(customerEntitlement) =>
				customerEntitlement.pooled_balance?.reset_mode ===
					PooledBalanceResetMode.Subscription &&
				customerEntitlement.pooled_balance.stripe_subscription_id ===
					eventContext.stripeSubscriptionId &&
				isCustomerEntitlementDueAtInvoice({
					customerEntitlement,
					invoicePeriodEndMs,
				}),
		);

	if (resettablePooledCustomerEntitlements.length === 0) return;

	await resetPooledBalances({
		ctx,
		fullCustomer: eventContext.fullCustomer,
		pooledCustomerEntitlements: resettablePooledCustomerEntitlements,
		source: "invoice-created-pooled-balance-reset",
	});
};
