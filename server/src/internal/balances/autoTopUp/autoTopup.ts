import { withLock } from "@/external/redis/redisUtils.js";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import { computeAutoTopupPlan } from "./compute/computeAutoTopupPlan.js";
import { buildAutoTopUpLockKey } from "./helpers/autoTopUpUtils.js";
import { clearAutoTopupPendingKey } from "./helpers/enqueueAutoTopupWithBurstSuppression.js";
import { recordAutoTopupAttempt } from "./helpers/limits/index.js";
import { logAutoTopupContext } from "./logs/logAutoTopupContext.js";
import { setupAutoTopupContext } from "./setup/setupAutoTopupContext.js";

/** Workflow handler for auto top-ups. */
export const autoTopup = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
}) => {
	const { org, env, logger } = ctx;
	const { customerId, featureId } = payload;

	const executeAutoTopup = async () => {
		const start = performance.now();

		logger.info(
			`========= RUNNING AUTO TOPUP FOR CUSTOMER ${customerId} AND FEATURE ${featureId} ========`,
		);

		// 1. Setup — fetch full customer, auto-topup config, cusEnt, Stripe context
		const autoTopupContext = await setupAutoTopupContext({ ctx, payload });

		if (!autoTopupContext) return;

		logAutoTopupContext({ ctx, autoTopupContext });

		// 3. Compute — build line items + autumn billing plan + stripe invoice action
		const { autumnBillingPlan, stripeBillingPlan } = computeAutoTopupPlan({
			ctx,
			autoTopupContext,
		});

		logAutumnBillingPlan({
			ctx,
			plan: autumnBillingPlan,
			billingContext: autoTopupContext,
		});
		logStripeBillingPlan({
			ctx,
			stripeBillingPlan,
			billingContext: autoTopupContext,
		});

		let billingResult: Awaited<ReturnType<typeof executeBillingPlan>>;
		billingResult = await executeBillingPlan({
			ctx,
			billingContext: autoTopupContext,
			billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		});

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		await recordAutoTopupAttempt({
			ctx,
			autoTopupContext,
			billingResult,
		});

		if (billingResult.stripe?.stripeInvoice?.status !== "paid") {
			await voidStripeInvoiceIfOpen({
				ctx,
				stripeInvoice: billingResult.stripe?.stripeInvoice,
				source: "autoTopup",
			});
			return;
		}

		const durationMs = Math.round(performance.now() - start);
		logger.info(
			`[autoTopup] Completed for feature ${featureId}, customer ${customerId}, duration: ${durationMs}ms`,
		);
	};

	try {
		// 2. Execute under lock (shares attach lock to prevent concurrent attach + auto-topup)
		await withLock({
			lockKey: buildAutoTopUpLockKey({
				orgId: org.id,
				env,
				customerId,
			}),
			ttlMs: 60_000,
			errorMessage: `Another billing operation is already in progress for customer ${customerId}`,
			fn: executeAutoTopup,
		});
	} finally {
		await clearAutoTopupPendingKey({ ctx, customerId, featureId });
	}
};
