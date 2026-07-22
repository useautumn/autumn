import {
	isCustomerEntitlementDueAtInvoice,
	PooledBalanceResetMode,
	secondsToMs,
} from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { resetCusEnts } from "@/internal/balances/utils/sql/client.js";
import { applyResetResults } from "@/internal/customers/actions/resetCustomerEntitlements/applyResetResults.js";
import {
	type ProcessResetResult,
	processReset,
} from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import { processResetResultToResetCusEntParam } from "@/internal/customers/actions/resetCustomerEntitlements/processResetResultToResetCusEntParam.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

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
	const invoicePeriodEndMs = secondsToMs(
		eventContext.stripeInvoice.period_end,
	);
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

	const computed: Array<{
		cusEntId: string;
		result: ProcessResetResult;
	}> = [];

	for (const customerEntitlement of resettablePooledCustomerEntitlements) {
		const result = await processReset({
			ctx,
			cusEnt: { ...customerEntitlement, customer_product: null },
		});
		if (result) computed.push({ cusEntId: customerEntitlement.id, result });
	}

	if (computed.length === 0) return;

	const resets = computed.map(({ cusEntId, result }) =>
		processResetResultToResetCusEntParam({
			customerEntitlementId: cusEntId,
			result,
		}),
	);
	const { applied, skipped } = await resetCusEnts({ ctx, resets });

	await applyResetResults({
		ctx,
		fullCus: eventContext.fullCustomer,
		computed,
		skipped,
	});

	if (Object.keys(applied).length > 0) {
		await invalidateCachedFullSubject({
			ctx,
			customerId:
				eventContext.fullCustomer.id ?? eventContext.fullCustomer.internal_id,
			source: "invoice-created-pooled-balance-reset",
		});
	}
};
