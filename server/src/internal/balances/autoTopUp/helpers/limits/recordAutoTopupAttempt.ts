import type { BillingResult, InsertAutoTopupLimitState } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopupContext } from "../../autoTopupContext";
import { autoTopupLimitRepo } from "../../repos";
import {
	addToLimitsUpdate,
	normalizeWindowCounter,
} from "./autoTopupLimitWindowUtils.js";
import { getAutoTopupRateLimitConfigs } from "./autoTopupRateLimitConfigs.js";

export const recordAutoTopupAttempt = async ({
	ctx,
	autoTopupContext,
	billingResult,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
	billingResult: BillingResult;
}) => {
	const now = Date.now();
	const { limitState: state, autoTopupConfig } = autoTopupContext;
	const outcome =
		billingResult.stripe?.stripeInvoice?.status === "paid"
			? "success"
			: "failure";

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
