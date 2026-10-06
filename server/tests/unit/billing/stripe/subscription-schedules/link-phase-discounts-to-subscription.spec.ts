/** A new coupon on a rebuilt schedule reuses the subscription's discount, so its duration runs once across phases. */

import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { linkPhaseDiscountsToSubscription } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/linkPhaseDiscountsToSubscription";

const NOW_SECONDS = 1_800_000_000;
const ANCHOR = NOW_SECONDS + 10 * 86_400;

const stripeCliWithDiscounts = (discounts: Partial<Stripe.Discount>[]) => {
	const retrievals: string[] = [];
	const stripeCli = {
		subscriptions: {
			retrieve: async (subscriptionId: string) => {
				retrievals.push(subscriptionId);
				return { discounts };
			},
		},
	} as unknown as Stripe;
	return { stripeCli, retrievals };
};

const phasesWithCoupon = (
	coupon: string,
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => [
	{
		start_date: NOW_SECONDS,
		end_date: ANCHOR,
		items: [{ price: "price_pro" }],
		discounts: [{ coupon }],
	},
	{
		start_date: ANCHOR,
		items: [{ price: "price_pro" }],
		discounts: [{ coupon }],
	},
];

describe(chalk.yellowBright("linkPhaseDiscountsToSubscription"), () => {
	test("points every phase's new coupon at the subscription's discount for it", async () => {
		const { stripeCli } = stripeCliWithDiscounts([
			{ id: "di_half", end: null, source: { coupon: "coupon_half" } as never },
		]);

		const phases = await linkPhaseDiscountsToSubscription({
			stripeCli,
			subscriptionId: "sub_123",
			phases: phasesWithCoupon("coupon_half"),
		});

		expect(phases.map((phase) => phase.discounts)).toEqual([
			[{ discount: "di_half" }],
			[{ discount: "di_half" }],
		]);
	});

	test("drops the discount from phases starting after it ends", async () => {
		const { stripeCli } = stripeCliWithDiscounts([
			{
				id: "di_week",
				end: ANCHOR - 1,
				source: { coupon: "coupon_week" } as never,
			},
		]);

		const phases = await linkPhaseDiscountsToSubscription({
			stripeCli,
			subscriptionId: "sub_123",
			phases: phasesWithCoupon("coupon_week"),
		});

		expect(phases.map((phase) => phase.discounts)).toEqual([
			[{ discount: "di_week" }],
			[],
		]);
	});

	test("leaves phases with only existing discounts untouched, without a Stripe call", async () => {
		const { stripeCli, retrievals } = stripeCliWithDiscounts([]);
		const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
			{ items: [{ price: "price_pro" }], discounts: [{ discount: "di_old" }] },
		];

		expect(
			await linkPhaseDiscountsToSubscription({
				stripeCli,
				subscriptionId: "sub_123",
				phases,
			}),
		).toBe(phases);
		expect(retrievals).toEqual([]);
	});
});
