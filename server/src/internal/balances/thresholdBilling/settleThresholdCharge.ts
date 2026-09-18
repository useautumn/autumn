import { ms } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { clearThresholdPastDue } from "./clearThresholdPastDue.js";
import { computeThresholdBillingPlan } from "./compute/computeThresholdBillingPlan.js";
import { markThresholdPastDue } from "./markThresholdPastDue.js";
import { setupThresholdBillingContext } from "./setup/setupThresholdBillingContext.js";

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
}): Promise<{ settled: boolean }> => {
	const { logger } = ctx;
	let settled = false;

	const settle = async () => {
		const setupResult = await setupThresholdBillingContext({
			ctx,
			customerId,
			featureId,
		});

		if (!setupResult.ok) {
			logger.info(
				`[settleThresholdCharge] Skipping ${customerId}/${featureId}: ${setupResult.reason}`,
			);
			return;
		}

		settled = true;

		const { billingContext } = setupResult;
		const { autumnBillingPlan, stripeBillingPlan } =
			computeThresholdBillingPlan({ ctx, billingContext });

		const billingResult = await executeBillingPlan({
			ctx,
			billingContext,
			billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		});

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		const invoiceStatus = billingResult.stripe?.stripeInvoice?.status;
		const collected = invoiceStatus === "paid";

		if (collected) {
			await clearThresholdPastDue({
				ctx,
				fullCustomer: billingContext.fullCustomer,
			});
			return;
		}

		await markThresholdPastDue({
			ctx,
			customerId,
			customerProduct: billingContext.customerProduct,
			fullCustomer: billingContext.fullCustomer,
		});
	};

	await withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		ttlMs: ms.minutes(5),
		errorMessage: `Another billing operation is already in progress for customer ${customerId}`,
		fn: settle,
	});

	return { settled };
};
