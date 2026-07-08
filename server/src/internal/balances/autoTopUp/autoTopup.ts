import { AppEnv } from "@autumn/shared";
import { withLock } from "@/external/redis/redisUtils.js";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan.js";
import { updateCachedCustomerProductV2 } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import type { AutoTopupContext } from "./autoTopupContext.js";
import { computeAutoTopupPlan } from "./compute/computeAutoTopupPlan.js";
import { buildAutoTopUpLockKey } from "./helpers/autoTopUpUtils.js";
import { clearAutoTopupPendingKey } from "./helpers/enqueueAutoTopupWithBurstSuppression.js";
import { recordAutoTopupAttempt } from "./helpers/limits/index.js";
import { logAutoTopupContext } from "./logs/logAutoTopupContext.js";
import { setupAutoTopupContext } from "./setup/setupAutoTopupContext.js";
import {
	classifyAutoTopupError,
	sendAutoTopupFailedWebhook,
} from "./webhooks/sendAutoTopupFailedWebhook.js";
import { sendAutoTopupSucceededWebhook } from "./webhooks/sendAutoTopupSucceededWebhook.js";

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
	let failureWebhookSent = false;
	let lastAutoTopupContext: AutoTopupContext | undefined;

	const sendFailureWebhook = async ({
		autoTopupContext,
		...failure
	}: Omit<
		Parameters<typeof sendAutoTopupFailedWebhook>[0],
		"ctx" | "customerId" | "featureId"
	>) => {
		failureWebhookSent = true;
		await sendAutoTopupFailedWebhook({
			ctx,
			customerId,
			featureId,
			autoTopupContext,
			...failure,
		});
	};

	const executeAutoTopup = async () => {
		const start = performance.now();

		logger.info(
			`========= RUNNING AUTO TOPUP FOR CUSTOMER ${customerId} AND FEATURE ${featureId} ========`,
		);

		if (org.config.disabled_auto_topup && env === AppEnv.Live) {
			const message = `Auto top-up is disabled for organization ${org.id}, skipping`;
			logger.info(`[autoTopup] ${message}`);
			return;
		}

		// 1. Setup — fetch full customer, auto-topup config, cusEnt, Stripe context
		const setupResult = await setupAutoTopupContext({ ctx, payload });

		if (!setupResult.ok) {
			if (setupResult.failure) {
				await sendFailureWebhook(setupResult.failure);
			}
			return;
		}

		const { autoTopupContext } = setupResult;
		lastAutoTopupContext = autoTopupContext;

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

		if (org.config.dryrun_autotopups) {
			const message = "Dry run enabled, skipping recordAutoTopupAttempt";
			logger.info(`[autoTopup] ${message}`, { extras: ctx.extraLogs });
			return;
		}

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

		const isInvoiceMode = Boolean(autoTopupContext.invoiceMode);
		const invoiceStatus = billingResult.stripe?.stripeInvoice?.status;
		const isCustomPm = autoTopupContext.paymentMethod?.type === "custom";

		if (!isInvoiceMode && !isCustomPm && invoiceStatus !== "paid") {
			try {
				await voidStripeInvoiceIfOpen({
					ctx,
					stripeInvoice: billingResult.stripe?.stripeInvoice,
					source: "autoTopup",
				});
			} finally {
				await sendFailureWebhook({
					reason: "charge_failed",
					retryable: false,
					message: `Auto top-up invoice status was ${invoiceStatus ?? "missing"}, expected paid`,
					autoTopupContext,
				});
			}
			return;
		}

		if (isCustomPm) {
			return;
		}

		const customerProductUpdate = autumnBillingPlan.updateCustomerProduct;
		if (customerProductUpdate?.updates.options) {
			const customerProductId = customerProductUpdate.customerProduct.id;
			await updateCachedCustomerProductV2({
				ctx,
				customerId,
				customerProductId,
				updates: customerProductUpdate.updates,
			});
		}

		await sendAutoTopupSucceededWebhook({
			ctx,
			autoTopupContext,
			billingResult,
		});

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
	} catch (error) {
		if (!failureWebhookSent) {
			const failure = classifyAutoTopupError({ error });
			await sendFailureWebhook({
				...failure,
				error,
				autoTopupContext: lastAutoTopupContext,
			});
		}
		throw error;
	} finally {
		await clearAutoTopupPendingKey({ ctx, customerId, featureId });
	}
};
