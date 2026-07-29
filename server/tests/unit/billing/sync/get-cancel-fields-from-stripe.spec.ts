/**
 * TDD contract for the sync canceling ended_at fallback.
 *
 * Contract under test:
 *   getCancelFieldsFromStripe:
 *     - not canceling -> {} (no canceledAt / endedAt)
 *     - canceling + ended_at -> endedAt = ended_at * 1000 (highest precedence)
 *     - canceling + cancel_at (no ended_at) -> endedAt = cancel_at * 1000
 *     - canceling + NEITHER (cancel_at_period_end only) -> endedAt falls back to
 *       getCycleEnd(billing_cycle_anchor, largest item interval) and is > now
 *     - canceledAt = canceled_at * 1000 when present, ~now otherwise
 *   stripeSubscriptionToLargestInterval:
 *     - picks the largest total duration across items (year > 6x month > month)
 *     - returns null when no item has a recurring price
 */
import { describe, expect, test } from "bun:test";
import { EntInterval, getCycleEnd } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToLargestInterval } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import { getCancelFieldsFromStripe } from "@/internal/billing/v2/actions/sync/utils/initSyncFromStripe";

const ANCHOR_SEC = 1_750_000_000; // 2025-06-15T15:06:40Z

type Recurring = { interval: string; interval_count?: number };

const buildSub = ({
	items = [{ interval: "month" }],
	...overrides
}: Partial<{
	items: (Recurring | null)[];
	billing_cycle_anchor: number;
	cancel_at_period_end: boolean;
	canceled_at: number | null;
	cancel_at: number | null;
	ended_at: number | null;
}> = {}): Stripe.Subscription =>
	({
		items: {
			data: items.map((recurring) => ({ price: { recurring } })),
		},
		billing_cycle_anchor: ANCHOR_SEC,
		cancel_at_period_end: false,
		canceled_at: null,
		cancel_at: null,
		ended_at: null,
		...overrides,
	}) as unknown as Stripe.Subscription;

describe("getCancelFieldsFromStripe", () => {
	test("not canceling -> no cancel fields", () => {
		const result = getCancelFieldsFromStripe({
			stripeSubscription: buildSub(),
		});
		expect(result.canceledAt).toBeUndefined();
		expect(result.endedAt).toBeUndefined();
	});

	test("ended_at takes precedence", () => {
		const result = getCancelFieldsFromStripe({
			stripeSubscription: buildSub({
				canceled_at: ANCHOR_SEC,
				cancel_at: ANCHOR_SEC + 100,
				ended_at: ANCHOR_SEC + 50,
			}),
		});
		expect(result.canceledAt).toBe(ANCHOR_SEC * 1000);
		expect(result.endedAt).toBe((ANCHOR_SEC + 50) * 1000);
	});

	test("cancel_at used when no ended_at", () => {
		const result = getCancelFieldsFromStripe({
			stripeSubscription: buildSub({
				canceled_at: ANCHOR_SEC,
				cancel_at: ANCHOR_SEC + 100,
			}),
		});
		expect(result.endedAt).toBe((ANCHOR_SEC + 100) * 1000);
	});

	test("no ended_at/cancel_at -> falls back to anchor cycle end of largest interval", () => {
		const stripeSubscription = buildSub({
			cancel_at_period_end: true,
			items: [{ interval: "month" }, { interval: "year" }],
		});
		const before = Date.now();
		const result = getCancelFieldsFromStripe({ stripeSubscription });

		expect(result.endedAt).toBeDefined();
		expect(result.endedAt!).toBeGreaterThan(before);
		expect(result.endedAt).toBe(
			getCycleEnd({
				anchor: ANCHOR_SEC * 1000,
				interval: EntInterval.Year,
				intervalCount: 1,
				now: before,
			}),
		);
		// canceledAt falls back to ~now when Stripe has no canceled_at.
		expect(result.canceledAt).toBeGreaterThanOrEqual(before);
		expect(result.canceledAt).toBeLessThanOrEqual(Date.now());
	});
});

describe("stripeSubscriptionToLargestInterval", () => {
	test("year beats month", () => {
		const largest = stripeSubscriptionToLargestInterval({
			stripeSubscription: buildSub({
				items: [{ interval: "month" }, { interval: "year" }],
			}),
		});
		expect(largest).toEqual({ interval: EntInterval.Year, intervalCount: 1 });
	});

	test("interval_count is part of the duration (3x month beats 1x month)", () => {
		const largest = stripeSubscriptionToLargestInterval({
			stripeSubscription: buildSub({
				items: [
					{ interval: "month" },
					{ interval: "month", interval_count: 3 },
				],
			}),
		});
		expect(largest).toEqual({ interval: EntInterval.Month, intervalCount: 3 });
	});

	test("year beats 6x month", () => {
		const largest = stripeSubscriptionToLargestInterval({
			stripeSubscription: buildSub({
				items: [{ interval: "month", interval_count: 6 }, { interval: "year" }],
			}),
		});
		expect(largest).toEqual({ interval: EntInterval.Year, intervalCount: 1 });
	});

	test("no recurring items -> null", () => {
		const largest = stripeSubscriptionToLargestInterval({
			stripeSubscription: buildSub({ items: [null] }),
		});
		expect(largest).toBeNull();
	});
});
