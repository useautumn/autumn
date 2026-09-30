/**
 * Stripe has no open-ended future phase, so a schedule that ends one plan while
 * an ongoing plan keeps billing adds a last phase holding only the ongoing plan's
 * prices, then releases. A last phase that renews a scheduled plan is real.
 */

import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import { findStripeScheduleReleaseTailPhase } from "@/external/stripe/subscriptionSchedules";

const DAY = 24 * 60 * 60;
const START = 1_900_000_000;

const SCHEDULED_BASE = "price_scheduled_base";
const ONGOING_USAGE = "price_ongoing_usage";
const ONGOING_BASE = "price_ongoing_base";

const phase = ({ start, prices }: { start: number; prices: string[] }) =>
	({
		start_date: start,
		end_date: start + 365 * DAY,
		items: prices.map((price) => ({ price, quantity: 1 })),
		add_invoice_items: [],
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

const scheduleWith = ({
	endBehavior = "release",
	lastPrices,
}: {
	endBehavior?: Stripe.SubscriptionSchedule.EndBehavior;
	lastPrices: string[];
}) =>
	({
		end_behavior: endBehavior,
		phases: [
			phase({
				start: START,
				prices: [SCHEDULED_BASE, ONGOING_BASE, ONGOING_USAGE],
			}),
			phase({ start: START + 365 * DAY, prices: lastPrices }),
		],
	}) as unknown as Stripe.SubscriptionSchedule;

const findTail = ({ schedule }: { schedule: Stripe.SubscriptionSchedule }) =>
	findStripeScheduleReleaseTailPhase({
		schedule,
		ongoingStripePriceIds: new Set([ONGOING_BASE, ONGOING_USAGE]),
	});

describe("findStripeScheduleReleaseTailPhase", () => {
	it("finds a last phase holding only an ongoing plan's usage", () => {
		const schedule = scheduleWith({ lastPrices: [ONGOING_USAGE] });

		expect(findTail({ schedule })).toBe(schedule.phases[1] ?? null);
	});

	it("finds it when the ongoing plan's base price keeps billing too", () => {
		const schedule = scheduleWith({
			lastPrices: [ONGOING_BASE, ONGOING_USAGE],
		});

		expect(findTail({ schedule })).toBe(schedule.phases[1] ?? null);
	});

	it("ignores a last phase that renews a scheduled plan's price", () => {
		const schedule = scheduleWith({
			lastPrices: [SCHEDULED_BASE, ONGOING_USAGE],
		});

		expect(findTail({ schedule })).toBeNull();
	});

	it("ignores it when the schedule cancels instead of releasing", () => {
		const schedule = scheduleWith({
			endBehavior: "cancel",
			lastPrices: [ONGOING_USAGE],
		});

		expect(findTail({ schedule })).toBeNull();
	});
});
