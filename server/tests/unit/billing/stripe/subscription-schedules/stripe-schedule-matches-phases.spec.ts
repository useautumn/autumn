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
	prorationBehavior = "create_prorations",
}: {
	start: number;
	end: number;
	price: string;
	prorationBehavior?: Stripe.SubscriptionSchedule.Phase.ProrationBehavior;
}) =>
	({
		start_date: start,
		end_date: end,
		items: [{ price, quantity: 1 }],
		proration_behavior: prorationBehavior,
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

const liveSchedule = ({
	endBehavior,
	lastEnd,
	status = "active",
	firstStart = NOW_SECONDS - 100,
	nextPhaseProrationBehavior,
}: {
	endBehavior: Stripe.SubscriptionSchedule.EndBehavior;
	lastEnd: number;
	status?: Stripe.SubscriptionSchedule.Status;
	firstStart?: number;
	nextPhaseProrationBehavior?: Stripe.SubscriptionSchedule.Phase.ProrationBehavior;
}) =>
	({
		status,
		end_behavior: endBehavior,
		phases: [
			livePhase({
				start: firstStart,
				end: NEXT_PHASE,
				price: "price_pro",
			}),
			livePhase({
				start: NEXT_PHASE,
				end: lastEnd,
				price: "price_premium",
				prorationBehavior: nextPhaseProrationBehavior,
			}),
		],
	}) as unknown as Stripe.SubscriptionSchedule;

const requestedPhases = ({
	lastEnd,
	nextPhaseProrationBehavior,
}: {
	lastEnd?: number;
	nextPhaseProrationBehavior?: Stripe.SubscriptionScheduleUpdateParams.Phase.ProrationBehavior;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => [
	{
		start_date: NOW_SECONDS - 100,
		end_date: NEXT_PHASE,
		items: [{ price: "price_pro", quantity: 1 }],
		proration_behavior: "none",
	},
	{
		start_date: NEXT_PHASE,
		end_date: lastEnd,
		items: [{ price: "price_premium", quantity: 1 }],
		proration_behavior: nextPhaseProrationBehavior,
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

	test("a not-started schedule whose first phase start moved is a change", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({
					endBehavior: "release",
					lastEnd: OLD_END,
					status: "not_started",
					firstStart: NOW_SECONDS + 7 * 86_400,
				}),
				phases: requestedPhases({}),
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(false);
	});

	test("an active schedule keeps its current phase start fixed", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({
					endBehavior: "release",
					lastEnd: OLD_END,
					firstStart: NOW_SECONDS - 7 * 86_400,
				}),
				phases: requestedPhases({}),
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(true);
	});

	test("a later phase whose proration changed is a change", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({
					endBehavior: "release",
					lastEnd: OLD_END,
					nextPhaseProrationBehavior: "always_invoice",
				}),
				phases: requestedPhases({ nextPhaseProrationBehavior: "none" }),
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(false);
	});

	test("an unset proration matches Stripe's default, and the started phase's is ignored", () => {
		expect(
			stripeScheduleMatchesPhases({
				schedule: liveSchedule({ endBehavior: "release", lastEnd: OLD_END }),
				phases: requestedPhases({}),
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(true);
	});

	test("a coupon added to the subscription but missing from a later phase is a change", () => {
		const schedule = liveSchedule({ endBehavior: "release", lastEnd: OLD_END });
		schedule.phases[0]!.discounts = [
			{ coupon: "coupon_half", discount: null, promotion_code: null },
		];
		const phases = requestedPhases({}).map((phase) => ({
			...phase,
			discounts: [{ coupon: "coupon_half" }],
		}));

		expect(
			stripeScheduleMatchesPhases({
				schedule,
				phases,
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(false);
	});

	test("phases sharing the subscription's discount match the requested discount", () => {
		const schedule = liveSchedule({ endBehavior: "release", lastEnd: OLD_END });
		for (const phase of schedule.phases) {
			phase.discounts = [
				{ coupon: null, discount: "di_half", promotion_code: null },
			];
		}
		const phases = requestedPhases({}).map((phase) => ({
			...phase,
			discounts: [{ discount: "di_half" }],
		}));

		expect(
			stripeScheduleMatchesPhases({
				schedule,
				phases,
				endBehavior: "release",
				nowMs: NOW_SECONDS * 1000,
			}),
		).toBe(true);
	});
});
