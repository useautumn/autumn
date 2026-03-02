import { expect } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { formatMs } from "@autumn/shared";

type V5CustomerOrEntity = ApiCustomerV5 | ApiEntityV2;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Verify a V5 subscription is currently trialing with the expected trial end time. */
export const expectSubscriptionTrialing = async ({
	customer,
	productId,
	trialEndsAt: expectedTrialEndsAt,
	toleranceMs = TEN_MINUTES_MS,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
	trialEndsAt?: number;
	toleranceMs?: number;
}) => {
	const sub = customer.subscriptions.find((s) => s.plan_id === productId);

	expect(
		sub,
		`Subscription ${productId} not found for trialing check`,
	).toBeDefined();

	// V5 trialing: status is "active" with trial_ends_at set
	expect(
		sub!.status,
		`Subscription ${productId} should have status "active" but got "${sub!.status}"`,
	).toBe("active");
	expect(
		sub!.trial_ends_at,
		`Subscription ${productId} should have trial_ends_at set when trialing`,
	).not.toBeNull();

	if (expectedTrialEndsAt !== undefined) {
		const diff = Math.abs(sub!.trial_ends_at! - expectedTrialEndsAt);
		expect(
			diff <= toleranceMs,
			`Subscription ${productId} trial_ends_at (${formatMs(sub!.trial_ends_at)}) should be within ${toleranceMs}ms of ${formatMs(expectedTrialEndsAt)}`,
		).toBe(true);
	}

	return sub!.trial_ends_at;
};

/** Verify a V5 subscription is NOT trialing. */
export const expectSubscriptionNotTrialing = async ({
	customer,
	productId,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
}) => {
	const sub = customer.subscriptions.find((s) => s.plan_id === productId);

	expect(
		sub,
		`Subscription ${productId} not found for not-trialing check`,
	).toBeDefined();

	expect(
		sub!.trial_ends_at,
		`Subscription ${productId} should not have trial_ends_at set`,
	).toBeNull();
};

/** Verify a V5 subscription's current_period_end aligns with trial end time. */
export const expectSubscriptionPeriodAlignedWithTrialEnd = async ({
	customer,
	productId,
	trialEndsAt,
}: {
	customer: V5CustomerOrEntity;
	productId: string;
	trialEndsAt: number;
}) => {
	const sub = customer.subscriptions.find((s) => s.plan_id === productId);

	expect(
		sub,
		`Subscription ${productId} not found for period alignment check`,
	).toBeDefined();

	expect(
		sub!.current_period_end,
		`Subscription ${productId} should have current_period_end defined`,
	).not.toBeNull();

	const diff = Math.abs(sub!.current_period_end! - trialEndsAt);
	expect(
		diff < ONE_HOUR_MS,
		`Subscription ${productId} current_period_end (${sub!.current_period_end}) should align with trial_ends_at (${trialEndsAt})`,
	).toBe(true);
};
