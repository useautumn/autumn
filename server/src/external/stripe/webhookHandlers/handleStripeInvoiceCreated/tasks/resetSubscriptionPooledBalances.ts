import {
	isCustomerEntitlementDueAtInvoice,
	PooledBalanceResetMode,
	secondsToMs,
} from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { computeScheduledPooledAnchorResetPlan } from "@/internal/billing/v2/pooledBalances/compute/computeScheduledPooledAnchorResetPlan.js";
import { executePooledBalancePlan } from "@/internal/billing/v2/pooledBalances/execute/executePooledBalancePlan.js";
import { resetPooledBalances } from "@/internal/billing/v2/pooledBalances/execute/resetPooledBalances.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

export const resetSubscriptionPooledBalances = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	const completedResetIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);
	const isScheduledAnchorReset =
		eventContext.stripeInvoice.billing_reason === "subscription_update" &&
		completedResetIds.size > 0;
	if (isScheduledAnchorReset) {
		const pooledBalancePlan = computeScheduledPooledAnchorResetPlan({
			ctx,
			fullCustomer: eventContext.fullCustomer,
			customerProducts: eventContext.customerProducts.filter((product) =>
				completedResetIds.has(product.id),
			),
			stripeSubscriptionId: eventContext.stripeSubscriptionId,
			anchorMs: secondsToMs(
				eventContext.stripeSubscription.billing_cycle_anchor,
			),
		});
		await executePooledBalancePlan({ ctx, pooledBalancePlan });
		const pools = pooledBalancePlan.updatePoolBalances.map(
			(update) => update.pooledCustomerEntitlement,
		);
		for (const pool of pools) {
			await CusEntService.update({
				ctx,
				id: pool.id,
				updates: { reset_cycle_anchor: pool.reset_cycle_anchor },
			});
		}
		await resetPooledBalances({
			ctx,
			fullCustomer: eventContext.fullCustomer,
			pooledCustomerEntitlements: pools,
			source: "invoice-created-pooled-anchor-reset",
		});
		return;
	}
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
