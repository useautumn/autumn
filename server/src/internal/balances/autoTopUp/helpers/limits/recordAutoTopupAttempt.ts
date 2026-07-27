import type { BillingResult, InsertAutoTopupLimitState } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopupContext } from "../../autoTopupContext";
import { autoTopupLimitRepo } from "../../repos";
import {
	addToLimitsUpdate,
	normalizeWindowCounter,
} from "./autoTopupLimitWindowUtils.js";
import { getAutoTopupRateLimitConfigs } from "./autoTopupRateLimitConfigs.js";
import { paymentMethodToFingerprint } from "./paymentMethodFingerprint.js";

/**
 * Consecutive failed top-ups before auto top-ups are suspended for the
 * customer + feature. Suspension is durable — see preflightAutoTopupLimits.
 */
export const MAX_CONSECUTIVE_AUTO_TOPUP_FAILURES = 3;

export const recordAutoTopupAttempt = async ({
	ctx,
	autoTopupContext,
	billingResult,
	forceFailure = false,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
	billingResult?: BillingResult;
	/** Records a failure when execution threw before producing a result. */
	forceFailure?: boolean;
}) => {
	const now = Date.now();
	const { limitState: state, autoTopupConfig } = autoTopupContext;
	const invoiceStatus = billingResult?.stripe?.stripeInvoice?.status;
	const isInvoiceMode = Boolean(autoTopupContext.invoiceMode);
	const succeeded =
		!forceFailure &&
		(invoiceStatus === "paid" || (isInvoiceMode && invoiceStatus === "open"));
	const outcome = succeeded ? "success" : "failure";

	const { purchaseLimit, attemptLimit, failedAttemptLimit } =
		getAutoTopupRateLimitConfigs({ autoTopupConfig });

	const normalizedAttempt = normalizeWindowCounter({
		now,
		windowEndsAt: state.attempt_window_ends_at,
		count: state.attempt_count,
		windowConfig: attemptLimit,
	})!;
	const normalizedFailedAttempt = normalizeWindowCounter({
		now,
		windowEndsAt: state.failed_attempt_window_ends_at,
		count: state.failed_attempt_count,
		windowConfig: failedAttemptLimit,
	})!;
	const normalizedPurchase = normalizeWindowCounter({
		now,
		windowEndsAt: state.purchase_window_ends_at,
		count: state.purchase_count,
		windowConfig: purchaseLimit,
	});

	const updates: Partial<InsertAutoTopupLimitState> = {};

	addToLimitsUpdate({
		updates,
		state,
		windowEndsAtField: "attempt_window_ends_at",
		countField: "attempt_count",
		windowEndsAt: normalizedAttempt.windowEndsAt,
		count: normalizedAttempt.count + 1,
	});

	if (state.last_attempt_at !== now) {
		updates.last_attempt_at = now;
	}

	if (outcome === "failure") {
		addToLimitsUpdate({
			updates,
			state,
			windowEndsAtField: "failed_attempt_window_ends_at",
			countField: "failed_attempt_count",
			windowEndsAt: normalizedFailedAttempt.windowEndsAt,
			count: normalizedFailedAttempt.count + 1,
		});

		if (state.last_failed_attempt_at !== now) {
			updates.last_failed_attempt_at = now;
		}

		const consecutiveFailures = state.consecutive_failure_count + 1;
		updates.consecutive_failure_count = consecutiveFailures;

		if (
			consecutiveFailures >= MAX_CONSECUTIVE_AUTO_TOPUP_FAILURES &&
			!state.suspended_at
		) {
			updates.suspended_at = now;
			updates.suspended_reason = "consecutive_failures";
			updates.suspended_payment_method_fingerprint =
				paymentMethodToFingerprint({
					paymentMethod: autoTopupContext.paymentMethod,
				}) ?? null;

			ctx.logger.warn(
				`[recordAutoTopupAttempt] Suspending auto top-ups for customer ${autoTopupContext.fullCustomer.id} and feature ${autoTopupConfig.feature_id} after ${consecutiveFailures} consecutive failures`,
			);
		}
	}

	if (outcome === "success" && state.consecutive_failure_count !== 0) {
		updates.consecutive_failure_count = 0;
	}

	if (outcome === "success" && purchaseLimit && normalizedPurchase) {
		addToLimitsUpdate({
			updates,
			state,
			windowEndsAtField: "purchase_window_ends_at",
			countField: "purchase_count",
			windowEndsAt: normalizedPurchase.windowEndsAt,
			count: normalizedPurchase.count + 1,
		});
	}

	if (Object.keys(updates).length > 0) {
		updates.updated_at = now;
	}

	await autoTopupLimitRepo.updateById({
		ctx,
		id: state.id,
		updates,
	});
};
