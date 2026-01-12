import { expect } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { ApiVersion, formatMs } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Verify a customer product is currently trialing with the expected trial end time.
 * Uses `status === "trialing"` and `current_period_end` to determine trial state.
 */
export const expectProductTrialing = async ({
	customerId,
	customer: providedCustomer,
	productId,
	trialEndsAt: expectedTrialEndsAt,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
	/** Expected trial end timestamp (10 min tolerance) */
	trialEndsAt?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for trialing check`,
	).toBeDefined();

	// Check status is "trialing"
	expect(
		product!.status,
		`Product ${productId} should have status "trialing" but got "${product!.status}"`,
	).toBe("trialing");

	// current_period_end represents when the trial ends
	const trialEndsAt = product!.current_period_end;
	expect(
		trialEndsAt,
		`Product ${productId} should have current_period_end defined when trialing`,
	).toBeDefined();

	// Verify trial_ends_at matches expected timestamp (with tolerance)
	if (expectedTrialEndsAt !== undefined) {
		expect(
			Math.abs(trialEndsAt! - expectedTrialEndsAt) < TEN_MINUTES_MS,
			`Product ${productId} current_period_end (${trialEndsAt}) should be within 10 min of ${expectedTrialEndsAt}`,
		).toBe(true);
	}

	return trialEndsAt;
};

/**
 * Verify a customer product is NOT trialing.
 * If nowMs is provided, checks if product is actually trialing based on test clock time
 * (status may be "trialing" but if nowMs >= current_period_end, trial has ended).
 */
export const expectProductNotTrialing = async ({
	customerId,
	customer: providedCustomer,
	productId,
	nowMs,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
	/** Current time in ms (e.g., advancedTo from test clock). If provided, checks if trial is actually active. */
	nowMs?: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for not-trialing check`,
	).toBeDefined();

	// If nowMs is provided, check if product is actually trialing based on test clock time
	if (nowMs !== undefined && product!.status === "trialing") {
		const currentPeriodStart = product!.current_period_start;
		const currentPeriodEnd = product!.current_period_end;
		if (!currentPeriodStart || !currentPeriodEnd) {
			throw new Error(
				`Product ${productId} has no current_period_start or current_period_end`,
			);
		}
		// If status is "trialing" but nowMs >= current_period_end, trial has ended
		// Only fail if nowMs < current_period_end (trial is actually still active)
		expect(
			nowMs >= currentPeriodStart || nowMs >= currentPeriodEnd,
			`Product ${productId} is still trialing (status: "trialing", current_period_end: ${formatMs(currentPeriodEnd)}, nowMs: ${formatMs(nowMs)}). Trial has not ended yet.`,
		).toBe(true);
		return;
	}

	// Without nowMs, simply check status is not "trialing"
	expect(
		product!.status,
		`Product ${productId} should not have status "trialing" but got "${product!.status}"`,
	).not.toBe("trialing");
};

/**
 * Verify a feature's next_reset_at aligns with trial end time.
 */
export const expectFeatureResetAlignedWithTrialEnd = async ({
	customerId,
	customer: providedCustomer,
	featureId,
	trialEndsAt,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	featureId: string;
	trialEndsAt: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	expect(
		customer.features,
		"Customer features not found for reset alignment check",
	).toBeDefined();

	const feature = customer.features![featureId];
	expect(
		feature,
		`Feature ${featureId} not found for reset alignment check`,
	).toBeDefined();

	expect(
		feature!.next_reset_at,
		`Feature ${featureId} should have next_reset_at defined`,
	).toBeDefined();

	// Allow up to 1 hour difference for timing variations
	expect(
		Math.abs(feature!.next_reset_at! - trialEndsAt) < ONE_HOUR_MS,
		`Feature ${featureId} next_reset_at (${feature!.next_reset_at}) should align with trial_ends_at (${trialEndsAt})`,
	).toBe(true);
};

/**
 * Verify a customer product's current_period_end aligns with trial end time.
 */
export const expectPeriodEndsAlignedWithTrialEnd = async ({
	customerId,
	customer: providedCustomer,
	productId,
	trialEndsAt,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
	trialEndsAt: number;
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	expect(
		product,
		`Product ${productId} not found for period_ends alignment check`,
	).toBeDefined();

	expect(
		product!.current_period_end,
		`Product ${productId} should have current_period_end defined`,
	).toBeDefined();

	// Allow up to 1 hour difference for timing variations
	expect(
		Math.abs(product!.current_period_end! - trialEndsAt) < ONE_HOUR_MS,
		`Product ${productId} current_period_end (${product!.current_period_end}) should align with trial_ends_at (${trialEndsAt})`,
	).toBe(true);
};

/**
 * Helper to calculate expected trial end time in milliseconds.
 */
export const calculateTrialEndMs = ({
	trialDays,
}: {
	trialDays: number;
}): number => {
	return Date.now() + trialDays * ONE_DAY_MS;
};

/**
 * Get the trial end time (current_period_end) from a trialing product.
 */
export const getTrialEndsAt = async ({
	customerId,
	customer: providedCustomer,
	productId,
}: {
	customerId?: string;
	customer?: ApiCustomerV3 | ApiEntityV0;
	productId: string;
}): Promise<number | null> => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const products = customer.products ?? [];
	const product = products.find((p: { id?: string }) => p.id === productId);

	if (!product || product.status !== "trialing") {
		return null;
	}

	return product.current_period_end ?? null;
};
