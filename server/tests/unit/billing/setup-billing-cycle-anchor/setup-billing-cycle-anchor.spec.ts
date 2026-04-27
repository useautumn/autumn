import { describe, expect, test } from "bun:test";
import type { TrialContext } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";

const NOW_MS = 1_700_000_000_000;
const TRIAL_END_S = Math.floor(NOW_MS / 1000) + 7 * 24 * 60 * 60;
const TRIAL_END_MS = TRIAL_END_S * 1000;
const ANCHOR_S = Math.floor(NOW_MS / 1000) + 30 * 24 * 60 * 60;
const ANCHOR_MS = ANCHOR_S * 1000;

const paidProduct = products.createFull({
	id: "pro",
	prices: [prices.createFixed({ id: "price_pro" })],
});

const trialingSub = {
	id: "sub_trialing",
	status: "trialing",
	trial_end: TRIAL_END_S,
	billing_cycle_anchor: ANCHOR_S,
} as Stripe.Subscription;

const activeSub = {
	id: "sub_active",
	status: "active",
	billing_cycle_anchor: ANCHOR_S,
} as Stripe.Subscription;

describe(chalk.yellowBright("setupBillingCycleAnchor"), () => {
	test("respects explicit requestedBillingCycleAnchor", () => {
		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			requestedBillingCycleAnchor: 12345,
		});
		expect(result).toBe(12345);
	});

	test("returns trialContext.trialEndsAt when it's in the future", () => {
		const trialContext: TrialContext = {
			freeTrial: null,
			trialEndsAt: TRIAL_END_MS,
			appliesToBilling: true,
			cardRequired: false,
		};

		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			trialContext,
		});
		expect(result).toBe(TRIAL_END_MS);
	});

	test("inherits Stripe sub's trial_end when sub is trialing and no trialContext", () => {
		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			stripeSubscription: trialingSub,
		});
		expect(result).toBe(TRIAL_END_MS);
	});

	test("REGRESSION: inherits Stripe sub's trial_end when sub is trialing and trialContext.trialEndsAt is null (upgrade-while-trialing to product without its own trial)", () => {
		// Repro of the blank-checkout bug for trial-upgrade-same-plan-group.
		// applyProductTrialConfig returns {trialEndsAt: null, ...} when the
		// new product has no free_trial config but the customer's current
		// Stripe sub is already trialing. The anchor must still be inherited
		// from the Stripe sub so billingPlanToNextCyclePreview can populate
		// next_cycle (otherwise it returns next_cycle: undefined and the
		// hosted checkout page renders without next-cycle data).
		const trialContext: TrialContext = {
			freeTrial: null,
			trialEndsAt: null,
			appliesToBilling: true,
			cardRequired: false,
		};

		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			stripeSubscription: trialingSub,
			trialContext,
		});

		expect(result).not.toBe("now");
		expect(result).toBe(TRIAL_END_MS);
	});

	test("REGRESSION: inherits Stripe sub's trial_end when sub is trialing and trialContext is undefined", () => {
		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			stripeSubscription: trialingSub,
			trialContext: undefined,
		});

		expect(result).not.toBe("now");
		expect(result).toBe(TRIAL_END_MS);
	});

	test("falls back to Stripe sub's billing_cycle_anchor when no trial info", () => {
		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			stripeSubscription: activeSub,
		});
		expect(result).toBe(ANCHOR_MS);
	});

	test("falls back to 'now' when nothing is configured", () => {
		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
		});
		expect(result).toBe("now");
	});

	test("prefers trialContext over Stripe trial when both have future ends", () => {
		const trialContext: TrialContext = {
			freeTrial: null,
			trialEndsAt: TRIAL_END_MS + 1_000_000,
			appliesToBilling: true,
			cardRequired: false,
		};

		const result = setupBillingCycleAnchor({
			newFullProduct: paidProduct,
			currentEpochMs: NOW_MS,
			stripeSubscription: trialingSub,
			trialContext,
		});
		expect(result).toBe(TRIAL_END_MS + 1_000_000);
	});
});
