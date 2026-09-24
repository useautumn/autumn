/**
 * Discount removals resolve against the subscription's live Stripe discounts.
 *
 * Contract:
 *   - Only discounts whose coupon matches a removed reward are dropped.
 *   - A reward that is no longer applied is a no-op, not an error.
 *   - Rollover copies (`<reward>_roll_<n>`) match their original reward id.
 *   - Clearing every discount sends an explicit Stripe unset; untouched empty lists send nothing.
 */

import { describe, expect, test } from "bun:test";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import chalk from "chalk";
import type Stripe from "stripe";
import { removeDiscountsByRewardIds } from "@/internal/billing/v2/providers/stripe/utils/discounts/removeDiscountsByRewardIds";
import { stripeDiscountsToSubscriptionUpdateParam } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

const subscriptionWithDiscountCount = (count: number) =>
	({
		discounts: Array.from({ length: count }, (_, index) => ({
			id: `di_${index}`,
		})),
	}) as unknown as Stripe.Subscription;

describe(chalk.yellowBright("removeDiscountsByRewardIds"), () => {
	test("drops only the discounts matching removed rewards", () => {
		const launch = discounts.twentyPercentOff({ couponId: "launch_30" });
		const loyalty = discounts.tenPercentOff({ couponId: "loyalty_10" });

		const result = removeDiscountsByRewardIds({
			discounts: [launch, loyalty],
			rewardIds: ["launch_30"],
		});

		expect(result).toEqual([loyalty]);
	});

	test("ignores rewards that are no longer applied", () => {
		const loyalty = discounts.tenPercentOff({ couponId: "loyalty_10" });

		const result = removeDiscountsByRewardIds({
			discounts: [loyalty],
			rewardIds: ["already_removed"],
		});

		expect(result).toEqual([loyalty]);
	});

	test("matches rollover coupon copies by their original reward id", () => {
		const rollover = discounts.twentyPercentOff({
			couponId: "launch_30_roll_1234",
		});

		const result = removeDiscountsByRewardIds({
			discounts: [rollover],
			rewardIds: ["launch_30"],
		});

		expect(result).toEqual([]);
	});
});

describe(chalk.yellowBright("stripeDiscountsToSubscriptionUpdateParam"), () => {
	test("sends the remaining discounts when some are left", () => {
		const loyalty = discounts.tenPercentOff({ couponId: "loyalty_10" });

		const result = stripeDiscountsToSubscriptionUpdateParam({
			stripeSubscription: subscriptionWithDiscountCount(2),
			stripeDiscounts: [loyalty],
		});

		expect(result).toEqual([{ coupon: "loyalty_10" }]);
	});

	test("explicitly clears Stripe when every applied discount was removed", () => {
		const result = stripeDiscountsToSubscriptionUpdateParam({
			stripeSubscription: subscriptionWithDiscountCount(1),
			stripeDiscounts: [],
		});

		expect(result).toBe("");
	});

	test("leaves discounts untouched when none were applied or requested", () => {
		const result = stripeDiscountsToSubscriptionUpdateParam({
			stripeSubscription: subscriptionWithDiscountCount(0),
			stripeDiscounts: [],
		});

		expect(result).toBeUndefined();
	});

	test("never clears discounts it could not read", () => {
		const unexpanded = {
			discounts: ["di_unexpanded"],
		} as unknown as Stripe.Subscription;

		for (const stripeDiscounts of [[], undefined]) {
			expect(
				stripeDiscountsToSubscriptionUpdateParam({
					stripeSubscription: unexpanded,
					stripeDiscounts,
				}),
			).toBeUndefined();
		}
		expect(
			stripeDiscountsToSubscriptionUpdateParam({
				stripeSubscription: subscriptionWithDiscountCount(1),
				stripeDiscounts: undefined,
			}),
		).toBeUndefined();
	});
});
