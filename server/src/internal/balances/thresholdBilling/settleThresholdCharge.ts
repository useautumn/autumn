import { ms } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildAutoTopUpLockKey } from "@/internal/balances/autoTopUp/helpers/autoTopUpUtils.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { clearThresholdPastDue } from "./clearThresholdPastDue.js";
import { computeThresholdSettlementPlan } from "./compute/computeThresholdSettlementPlan.js";
import { markThresholdPastDue } from "./markThresholdPastDue.js";
import { setupThresholdSettlementContext } from "./setup/setupThresholdSettlementContext.js";

/**
 * Bills overage the customer has already consumed. Unlike an auto top-up grant
 * this never declines to charge: spend limits and suspensions cap future
 * purchases, they do not forgive debt.
 */
export const settleThresholdCharge = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<{ handled: boolean }> => {
	const { logger } = ctx;
	let handled = false;

	const settle = async () => {
		const setupResult = await setupThresholdSettlementContext({
			ctx,
			customerId,
			featureId,
		});

		if (!setupResult.ok) {
			handled = setupResult.reason === "nothing_to_settle";
			logger.info(
				`[settleThresholdCharge] Skipping ${customerId}/${featureId}: ${setupResult.reason}`,
			);
			return;
		}

		handled = true;

		const { settlementContext } = setupResult;
		const { autumnBillingPlan, stripeBillingPlan } =
			computeThresholdSettlementPlan({ ctx, settlementContext });

		const billingResult = await executeBillingPlan({
			ctx,
			billingContext: settlementContext,
			billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		});

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		const invoiceStatus = billingResult.stripe?.stripeInvoice?.status;
		const collected = invoiceStatus === "paid";

		if (collected) {
			await clearThresholdPastDue({
				ctx,
				fullCustomer: settlementContext.fullCustomer,
			});
			return;
		}

		await markThresholdPastDue({
			ctx,
			customerId,
			customerProduct: settlementContext.customerEntitlement.customer_product!,
			fullCustomer: settlementContext.fullCustomer,
		});
	};

	await withLock({
		lockKey: buildAutoTopUpLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		ttlMs: ms.minutes(5),
		errorMessage: `Another billing operation is already in progress for customer ${customerId}`,
		fn: settle,
	});

	return { handled };
};
