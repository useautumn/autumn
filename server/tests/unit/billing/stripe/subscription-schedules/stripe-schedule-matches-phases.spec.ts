/** A live schedule only counts as already running the requested phases when a requested end date matches too. */

import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { stripeScheduleMatchesPhases } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/stripeScheduleMatchesPhases";

const NOW_SECONDS = 1_800_000_000;
const NEXT_PHASE = NOW_SECONDS + 30 * 86_400;
const OLD_END = NOW_SECONDS + 90 * 86_400;
const NEW_END = NOW_SECONDS + 120 * 86_400;

const livePhase = ({
	start,
	end,
	price,
}: {
	start: number;
	end: number;
	price: string;
}) =>
	({
		start_date: start,
		end_date: end,
		items: [{ price, quantity: 1 }],
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

const liveSchedule = ({
	endBehavior,
	lastEnd,
}: {
	endBehavior: Stripe.SubscriptionSchedule.EndBehavior;
	lastEnd: number;
}) =>
	({
		end_behavior: endBehavior,
		phases: [
			livePhase({
				start: NOW_SECONDS - 100,
				end: NEXT_PHASE,
				price: "price_pro",
			}),
			livePhase({ start: NEXT_PHASE, end: lastEnd, price: "price_premium" }),
		],
	}) as unknown as Stripe.SubscriptionSchedule;

const requestedPhases = ({
	lastEnd,
}: {
	lastEnd?: number;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => [
	{
		start_date: NOW_SECONDS - 100,
		end_date: NEXT_PHASE,
		items: [{ price: "price_pro", quantity: 1 }],
	},
	{
		start_date: NEXT_PHASE,
		end_date: lastEnd,
		items: [{ price: "price_premium", quantity: 1 }],
	},
];

describe(chalk.yellowBright("stripeScheduleMatchesPhases"), () => {
	test("a cancelling schedule with a moved end date is a change", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({ endBehavior: "cancel", lastEnd: OLD_END }),
				phases: requestedPhases({ lastEnd: NEW_END }),
				endBehavior: "cancel",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(false);
	});

	test("a cancelling schedule ending where requested matches", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({ endBehavior: "cancel", lastEnd: OLD_END }),
				phases: requestedPhases({ lastEnd: OLD_END }),
				endBehavior: "cancel",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(true);
	});

	test("a released schedule ignores the end Stripe derives for its last phase", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({ endBehavior: "release", lastEnd: OLD_END }),
				phases: requestedPhases({}),
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(true);
	});
});
