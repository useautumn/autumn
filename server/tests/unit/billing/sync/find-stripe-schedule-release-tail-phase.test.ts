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

const phase = ({
	start,
	prices,
	quantity = 1,
}: {
	start: number;
	prices: string[];
	quantity?: number;
}) =>
	({
		start_date: start,
		end_date: start + 365 * DAY,
		items: prices.map((price) => ({ price, quantity })),
		add_invoice_items: [],
	}) as unknown as Stripe.SubscriptionSchedule.Phase;

const scheduleWith = ({
	endBehavior = "release",
	lastPrices,
	lastQuantity,
}: {
	endBehavior?: Stripe.SubscriptionSchedule.EndBehavior;
	lastPrices: string[];
	lastQuantity?: number;
}) =>
	({
		end_behavior: endBehavior,
		phases: [
			phase({
				start: START,
				prices: [SCHEDULED_BASE, ONGOING_BASE, ONGOING_USAGE],
			}),
			phase({
				start: START + 365 * DAY,
				prices: lastPrices,
				quantity: lastQuantity,
			}),
		],
	}) as unknown as Stripe.SubscriptionSchedule;

const findTail = ({
	schedule,
	nowSeconds = START,
}: {
	schedule: Stripe.SubscriptionSchedule;
	nowSeconds?: number;
}) =>
	findStripeScheduleReleaseTailPhase({
		schedule,
		ongoingStripePriceIds: new Set([ONGOING_BASE, ONGOING_USAGE]),
		nowSeconds,
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

	it("ignores a last phase that changes an ongoing price's quantity", () => {
		const schedule = scheduleWith({
			lastPrices: [ONGOING_BASE],
			lastQuantity: 3,
		});

		expect(findTail({ schedule })).toBeNull();
	});

	it("ignores it once it has started, since it is then the current billing phase", () => {
		const schedule = scheduleWith({ lastPrices: [ONGOING_USAGE] });

		expect(
			findTail({ schedule, nowSeconds: START + 365 * DAY + 1 }),
		).toBeNull();
	});

	it("ignores it when the schedule cancels instead of releasing", () => {
		const schedule = scheduleWith({
			endBehavior: "cancel",
			lastPrices: [ONGOING_USAGE],
		});

		expect(findTail({ schedule })).toBeNull();
	});
});
