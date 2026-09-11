import { AppEnv, ms } from "@autumn/shared";
import {
	clearAutoTopupPendingKey,
	keepAutoTopupPendingKey,
} from "@/external/redis/actions/autoTopUpSuppression/autoTopUpSuppression.js";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { updateCachedCustomerProductV2 } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import type { AutoTopupContext } from "./autoTopupContext.js";
import { computeAutoTopupPlan } from "./compute/computeAutoTopupPlan.js";
import { buildAutoTopUpLockKey } from "./helpers/autoTopUpUtils.js";
import { recordAutoTopupAttempt } from "./helpers/limits/index.js";
import { logAutoTopupContext } from "./logs/logAutoTopupContext.js";
import { setupAutoTopupContext } from "./setup/setupAutoTopupContext.js";
import {
	classifyAutoTopupError,
	sendAutoTopupFailedWebhook,
} from "./webhooks/sendAutoTopupFailedWebhook.js";
import { sendAutoTopupSucceededWebhook } from "./webhooks/sendAutoTopupSucceededWebhook.js";

// Must outlive the queue's full retry chain (maxReceiveCount 10 × 30s visibility = 5m),
// else the gate reopens while copies still cycle and track traffic reseeds the storm.
const AUTO_TOPUP_RETRY_SUPPRESSION_MS = ms.minutes(10);

const isThresholdBilling = (autoTopupContext: AutoTopupContext) =>
	autoTopupContext.actionSource === "threshold_billing";

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
	let pendingTtlMs: number | undefined;

	const markThresholdProductPastDue = async ({
		autoTopupContext,
	}: {
		autoTopupContext: AutoTopupContext;
	}) => {
		const customerProduct =
			autoTopupContext.customerEntitlement.customer_product;
		if (!isThresholdBilling(autoTopupContext) || !customerProduct) return;
		if (customerProduct.product.config?.ignore_past_due) return;

		await customerProductActions.markPastDue({
			ctx,
			customerProduct,
			fullCustomer: autoTopupContext.fullCustomer,
		});
		await updateCachedCustomerProductV2({
			ctx,
			customerId,
			customerProductId: customerProduct.id,
			updates: { status: "past_due" },
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "threshold-billing-past-due",
		});
	};

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
				if (setupResult.failure.suppressionTtlMs) {
					pendingTtlMs = Math.min(
						setupResult.failure.suppressionTtlMs,
						AUTO_TOPUP_RETRY_SUPPRESSION_MS,
					);
				}
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
		try {
			billingResult = await executeBillingPlan({
				ctx,
				billingContext: autoTopupContext,
				billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
			});
		} catch (error) {
			// A throw here means the attempt still reached Stripe (and may have
			// left an invoice behind), so it has to count against the limits —
			// otherwise queue retries loop with no accounting at all.
			await recordAutoTopupAttempt({
				ctx,
				autoTopupContext,
				forceFailure: true,
			});
			throw error;
		}

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		await recordAutoTopupAttempt({
			ctx,
			autoTopupContext,
			billingResult,
		});
		if (
			isThresholdBilling(autoTopupContext) &&
			billingResult.stripe?.requiredAction?.code === "payment_failed" &&
			autoTopupContext.customerEntitlement.customer_product
		) {
			await markThresholdProductPastDue({ autoTopupContext });
		}
		if (
			isThresholdBilling(autoTopupContext) &&
			billingResult.stripe?.deferred
		) {
			pendingTtlMs = AUTO_TOPUP_RETRY_SUPPRESSION_MS;
			return;
		}

		const isInvoiceMode = Boolean(autoTopupContext.invoiceMode);
		const invoiceStatus = billingResult.stripe?.stripeInvoice?.status;
		const isCustomPm = autoTopupContext.paymentMethod?.type === "custom";
		const isPaymentProcessing =
			billingResult.stripe?.requiredAction?.code === "payment_processing";
		const shouldVoidInvoice =
			!isInvoiceMode &&
			!isCustomPm &&
			invoiceStatus !== "paid" &&
			!isPaymentProcessing;

		if (shouldVoidInvoice) {
			try {
				await voidStripeInvoiceIfOpen({
					ctx,
					stripeInvoice: billingResult.stripe?.stripeInvoice,
					source: "autoTopup",
				});
			} finally {
				await sendFailureWebhook({
					reason: "charge_failed",
					message: `Auto top-up invoice status was ${invoiceStatus ?? "missing"}, expected paid`,
					autoTopupContext,
				});
			}
			return;
		}

		if (isCustomPm) {
			return;
		}

		// An expiring top-up adds a balance row rather than patching one, so the
		// cached subject has to be dropped or the new grant stays invisible.
		if (autumnBillingPlan.insertCustomerEntitlements?.length) {
			await invalidateCachedFullSubject({ ctx, customerId });
			await deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "auto-topup-expiring-grant",
			});
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
			ttlMs: ms.minutes(5),
			errorMessage: `Another billing operation is already in progress for customer ${customerId}`,
			fn: executeAutoTopup,
		});
	} catch (error) {
		const failure = classifyAutoTopupError({ error });
		if (failure.reason === "lock_contention") {
			pendingTtlMs = AUTO_TOPUP_RETRY_SUPPRESSION_MS;
		} else if (!failureWebhookSent) {
			await sendFailureWebhook({
				...failure,
				error,
				autoTopupContext: lastAutoTopupContext,
			});
		}
		throw error;
	} finally {
		if (pendingTtlMs) {
			await keepAutoTopupPendingKey({
				ctx,
				customerId,
				featureId,
				ttlMs: pendingTtlMs,
			});
		} else {
			await clearAutoTopupPendingKey({ ctx, customerId, featureId });
		}
	}
};
