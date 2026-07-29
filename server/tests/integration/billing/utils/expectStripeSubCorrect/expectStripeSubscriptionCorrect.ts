import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { evaluateRewards } from "@/internal/billing/v2/actions/verify/evaluate/evaluateRewards";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import type { ExpectStripeSubOptions } from "./types";

/**
 * Verifies that all Stripe subscriptions for a customer match the expected state
 * derived from their customer products, via the production `/billing.verify` action.
 * Handles multiple subscriptions (new_billing_subscription), inline entity-scoped
 * prices, schedules, and cancellation, plus test-only assertions (`status`,
 * `shouldBeCanceling`, `rewards`) that aren't part of the verify contract.
 */
export const expectStripeSubscriptionCorrect = async ({
	ctx,
	customerId,
	options,
}: {
	ctx: TestContext;
	customerId: string;
	options?: ExpectStripeSubOptions;
}) => {
	if (options?.subCount !== undefined) {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(
			stripeCustomerId,
			`Customer ${customerId} has no Stripe processor ID`,
		).toBeDefined();

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		expect(subs.data.length).toBe(options.subCount);
	}

	const result = await verify({
		ctx,
		params: {
			customer_id: customerId,
			subscription_ids: options?.subId ? [options.subId] : undefined,
		},
	});

	expect(
		result.subscriptions.length,
		"Expected at least one subscription ID on customer products",
	).toBeGreaterThan(0);

	if (options?.debug) {
		console.log(
			`\nFound ${result.subscriptions.length} subscription(s) to verify:`,
		);
		console.log(JSON.stringify(result.subscriptions, null, 2));
	}

	for (const subResult of result.subscriptions) {
		expect(
			subResult.mismatches,
			`[sub:${subResult.stripe_subscription_id}] mismatches`,
		).toEqual([]);
	}

	const needsLiveSubCheck =
		options?.status !== undefined ||
		options?.shouldBeCanceling !== undefined ||
		options?.rewards !== undefined;
	if (!needsLiveSubCheck) return;

	for (const subResult of result.subscriptions) {
		const sub = await ctx.stripeCli.subscriptions.retrieve(
			subResult.stripe_subscription_id,
			{ expand: ["discounts.coupon"] },
		);

		if (options?.status) {
			expect(sub.status).toBe(options.status);
		}

		if (options?.shouldBeCanceling !== undefined) {
			expect(isStripeSubscriptionCanceling(sub)).toBe(
				options.shouldBeCanceling,
			);
		}

		if (options?.rewards) {
			const rewardMismatch = evaluateRewards({ sub, rewards: options.rewards });
			expect(rewardMismatch, `[sub:${sub.id}] reward mismatch`).toBeUndefined();
		}
	}
};
