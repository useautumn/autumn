import type {
	AutoTopup,
	AutoTopupLimitState,
	BillingAutoTopupFailureReason,
	FullCustomer,
	InsertAutoTopupLimitState,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopUpPayload } from "@/queue/workflows";
import { autoTopupLimitRepo } from "../../repos";
import {
	addToLimitsUpdate,
	normalizeWindowCounter,
} from "./autoTopupLimitWindowUtils.js";
import { getAutoTopupRateLimitConfigs } from "./autoTopupRateLimitConfigs.js";
import { getOrCreateAutoTopupLimitState } from "./getOrCreateAutoTopupLimitState.js";
import { paymentMethodToFingerprint } from "./paymentMethodFingerprint.js";

export const preflightAutoTopupLimits = async ({
	ctx,
	payload,
	fullCustomer,
	autoTopupConfig,
	paymentMethod,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
	fullCustomer: FullCustomer;
	autoTopupConfig: AutoTopup;
	paymentMethod?: Stripe.PaymentMethod | null;
}): Promise<{
	allowed: boolean;
	reason?: BillingAutoTopupFailureReason;
	blockedWindowEndsAt?: number;
	limitState: AutoTopupLimitState;
}> => {
	const now = Date.now();

	let state = await getOrCreateAutoTopupLimitState({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
		customerId: fullCustomer.id || fullCustomer.internal_id,
		featureId: payload.featureId,
		now,
	});

	// Durable circuit breaker. Checked before any window arithmetic so that an
	// expired window can never resurrect a customer whose card keeps declining.
	if (state.suspended_at) {
		const currentFingerprint = paymentMethodToFingerprint({ paymentMethod });
		const hasNewPaymentInfo =
			Boolean(currentFingerprint) &&
			currentFingerprint !== state.suspended_payment_method_fingerprint;

		if (!hasNewPaymentInfo) {
			ctx.logger.info(
				`[preflightAutoTopupLimits] Auto top-up suspended for customer ${fullCustomer.id} and feature ${payload.featureId} after ${state.consecutive_failure_count} consecutive failures`,
			);
			return {
				allowed: false,
				reason: "suspended_after_failures",
				limitState: state,
			};
		}

		ctx.logger.info(
			`[preflightAutoTopupLimits] Clearing auto top-up suspension for customer ${fullCustomer.id} and feature ${payload.featureId} — new payment method provided`,
		);

		await autoTopupLimitRepo.updateById({
			ctx,
			id: state.id,
			updates: {
				consecutive_failure_count: 0,
				suspended_at: null,
				suspended_reason: null,
				suspended_payment_method_fingerprint: null,
				updated_at: now,
			},
		});

		state = {
			...state,
			consecutive_failure_count: 0,
			suspended_at: null,
			suspended_reason: null,
			suspended_payment_method_fingerprint: null,
		};
	}

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

	const preflightUpdates: Partial<InsertAutoTopupLimitState> = {};

	addToLimitsUpdate({
		updates: preflightUpdates,
		state,
		windowEndsAtField: "attempt_window_ends_at",
		countField: "attempt_count",
		windowEndsAt: normalizedAttempt.windowEndsAt,
		count: normalizedAttempt.count,
	});
	addToLimitsUpdate({
		updates: preflightUpdates,
		state,
		windowEndsAtField: "failed_attempt_window_ends_at",
		countField: "failed_attempt_count",
		windowEndsAt: normalizedFailedAttempt.windowEndsAt,
		count: normalizedFailedAttempt.count,
	});

	if (normalizedPurchase) {
		addToLimitsUpdate({
			updates: preflightUpdates,
			state,
			windowEndsAtField: "purchase_window_ends_at",
			countField: "purchase_count",
			windowEndsAt: normalizedPurchase.windowEndsAt,
			count: normalizedPurchase.count,
		});
	}

	if (Object.keys(preflightUpdates).length > 0) {
		preflightUpdates.updated_at = now;
	}

	await autoTopupLimitRepo.updateById({
		ctx,
		id: state.id,
		updates: preflightUpdates,
	});

	if (
		purchaseLimit &&
		normalizedPurchase &&
		normalizedPurchase.count >= (purchaseLimit.limit ?? Number.MAX_SAFE_INTEGER)
	) {
		return {
			allowed: false,
			reason: "purchase_limit_reached",
			blockedWindowEndsAt: normalizedPurchase.windowEndsAt,
			limitState: state,
		};
	}

	if (normalizedAttempt.count >= attemptLimit.limit) {
		return {
			allowed: false,
			reason: "attempt_limit_reached",
			blockedWindowEndsAt: normalizedAttempt.windowEndsAt,
			limitState: state,
		};
	}

	if (normalizedFailedAttempt.count >= failedAttemptLimit.limit) {
		return {
			allowed: false,
			reason: "failed_attempt_limit_reached",
			blockedWindowEndsAt: normalizedFailedAttempt.windowEndsAt,
			limitState: state,
		};
	}

	return { allowed: true, limitState: state };
};
