/**
 * A subscription recreated for a backdate takes over the old one's payment method, collection,
 * tax settings, metadata and discounts, with a repeating discount keeping only its remaining cycles.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	ms,
	msToSeconds,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryReplacedSubscriptionSettings } from "@/internal/billing/v2/actions/setPlans/setup/carryReplacedSubscription/carryReplacedSubscriptionSettings";
import { remainingDiscountMonths } from "@/internal/billing/v2/actions/setPlans/setup/carryReplacedSubscription/remainingDiscountMonths";

const NOW = Date.UTC(2026, 9, 2, 12);
const PERIOD_END = Date.UTC(2026, 9, 14, 12);

const coupon = (overrides: Partial<Stripe.Coupon>) =>
	({
		id: "co_launch",
		name: "Launch",
		percent_off: 20,
		duration: "forever",
		...overrides,
	}) as Stripe.Coupon;

const subscriptionDiscount = ({
	id,
	couponOverrides,
	endMs,
}: {
	id: string;
	couponOverrides: Partial<Stripe.Coupon>;
	endMs?: number;
}): StripeDiscountWithCoupon => ({
	id,
	end: endMs === undefined ? null : msToSeconds(endMs),
	source: { coupon: coupon(couponOverrides) },
});

const liveSubscription = (overrides: Partial<Stripe.Subscription> = {}) =>
	({
		id: "sub_live",
		status: "active",
		metadata: { team: "growth", autumn_action_source: "attach" },
		default_payment_method: "pm_sub",
		collection_method: "send_invoice",
		days_until_due: 14,
		default_tax_rates: [{ id: "txr_vat" }],
		automatic_tax: { enabled: true },
		discounts: ["di_forever", "di_once", "di_repeating"],
		billing_cycle_anchor: msToSeconds(PERIOD_END),
		items: {
			data: [
				{
					current_period_end: msToSeconds(PERIOD_END),
					price: { recurring: { interval: "month", interval_count: 1 } },
				},
			],
		},
		...overrides,
	}) as unknown as Stripe.Subscription;

const backdateContext = (
	overrides: Partial<CreateScheduleBillingContext> = {},
): CreateScheduleBillingContext =>
	({
		currentEpochMs: NOW,
		subscriptionBackdateStartMs: NOW - ms.days(40),
		replacedStripeSubscription: liveSubscription(),
		stripeDiscounts: [],
		...overrides,
	}) as unknown as CreateScheduleBillingContext;

const ctx = {} as AutumnContext;

describe("carryReplacedSubscriptionSettings", () => {
	test("carries payment, collection, tax and metadata, leaving Autumn's own keys to Autumn", async () => {
		const carried = await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: backdateContext(),
			preview: true,
		});

		expect(carried.carriedSubscriptionParams).toEqual({
			default_payment_method: "pm_sub",
			collection_method: "send_invoice",
			days_until_due: 14,
			default_tax_rates: ["txr_vat"],
			automatic_tax: { enabled: true },
		});
		expect(carried.userMetadata).toEqual({ team: "growth" });
	});

	test("a forever discount moves as its coupon, a used once discount drops, a repeating one keeps going", async () => {
		const forever = subscriptionDiscount({
			id: "di_forever",
			couponOverrides: { id: "co_forever" },
		});
		const once = subscriptionDiscount({
			id: "di_once",
			couponOverrides: { id: "co_once", duration: "once" },
		});
		const repeating = subscriptionDiscount({
			id: "di_repeating",
			couponOverrides: {
				id: "co_repeating",
				duration: "repeating",
				duration_in_months: 6,
			},
			endMs: addMonths(PERIOD_END, 2).getTime(),
		});

		const carried = await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: backdateContext({
				stripeDiscounts: [forever, once, repeating],
			}),
			preview: true,
		});

		expect(
			carried.stripeDiscounts?.map(({ id, source }) => ({
				id,
				couponId: source.coupon.id,
			})),
		).toEqual([
			{ id: undefined, couponId: "co_forever" },
			{ id: undefined, couponId: "co_repeating" },
		]);
	});

	test("a legacy subscription-level default source moves with it", async () => {
		const carried = await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: backdateContext({
				replacedStripeSubscription: liveSubscription({
					default_payment_method: null,
					default_source: "card_legacy",
				}),
			}),
			preview: true,
		});

		expect(carried.carriedSubscriptionParams?.default_source).toBe(
			"card_legacy",
		);
		expect(
			carried.carriedSubscriptionParams?.default_payment_method,
		).toBeUndefined();
	});

	test("the previewed repeating coupon runs only the months execution would copy", async () => {
		const repeating = subscriptionDiscount({
			id: "di_repeating",
			couponOverrides: {
				id: "co_repeating",
				duration: "repeating",
				duration_in_months: 6,
			},
			endMs: addMonths(PERIOD_END, 2).getTime(),
		});

		const carried = await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: backdateContext({ stripeDiscounts: [repeating] }),
			preview: true,
		});

		expect(carried.stripeDiscounts?.[0]?.source.coupon).toMatchObject({
			id: "co_repeating",
			duration: "repeating",
			duration_in_months: 2,
		});
	});

	test("with billing changes skipped nothing is carried, though the preview still shows it", async () => {
		const billingContext = backdateContext({ skipBillingChanges: true });

		expect(
			await carryReplacedSubscriptionSettings({
				ctx,
				billingContext,
				preview: false,
			}),
		).toEqual({});
		expect(
			(
				await carryReplacedSubscriptionSettings({
					ctx,
					billingContext,
					preview: true,
				})
			).carriedSubscriptionParams,
		).toBeDefined();
	});

	test("a customer's own discount isn't the subscription's to move", async () => {
		const customerDiscount = subscriptionDiscount({
			id: "di_customer",
			couponOverrides: { id: "co_customer" },
		});

		const carried = await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: backdateContext({ stripeDiscounts: [customerDiscount] }),
			preview: true,
		});

		expect(carried.stripeDiscounts).toEqual([customerDiscount]);
	});

	test("nothing is carried when no live subscription is recreated", async () => {
		expect(
			await carryReplacedSubscriptionSettings({
				ctx,
				billingContext: backdateContext({
					replacedStripeSubscription: liveSubscription({ status: "unpaid" }),
				}),
				preview: true,
			}),
		).toEqual({});
	});
});

describe("remainingDiscountMonths", () => {
	const monthly = { interval: "month", intervalCount: 1 } as const;

	test("renewals step from the anchor, so a day-31 cycle renews on Mar 31, not Mar 28", () => {
		expect(
			remainingDiscountMonths({
				currentEpochMs: Date.UTC(2027, 1, 10, 12),
				billingCycleAnchorMs: Date.UTC(2027, 0, 31, 12),
				periodEndMs: Date.UTC(2027, 1, 28, 12),
				renewal: monthly,
				discountEndMs: Date.UTC(2027, 2, 30, 12),
			}),
		).toBe(1);
	});

	test("covers exactly the renewals the old discount would have reached", () => {
		expect(
			remainingDiscountMonths({
				currentEpochMs: NOW,
				billingCycleAnchorMs: PERIOD_END,
				periodEndMs: PERIOD_END,
				renewal: monthly,
				discountEndMs: addMonths(PERIOD_END, 2).getTime(),
			}),
		).toBe(2);
		expect(
			remainingDiscountMonths({
				currentEpochMs: NOW,
				billingCycleAnchorMs: PERIOD_END,
				periodEndMs: PERIOD_END,
				renewal: monthly,
				discountEndMs: addMonths(PERIOD_END, 2).getTime() + ms.days(3),
			}),
		).toBe(3);
	});

	test("a discount ending by the period end has nothing left to carry", () => {
		expect(
			remainingDiscountMonths({
				currentEpochMs: NOW,
				billingCycleAnchorMs: PERIOD_END,
				periodEndMs: PERIOD_END,
				renewal: monthly,
				discountEndMs: PERIOD_END,
			}),
		).toBe(0);
	});

	test("an annual renewal inside the discount is reached and the next one isn't", () => {
		const months = remainingDiscountMonths({
			currentEpochMs: NOW,
			billingCycleAnchorMs: PERIOD_END,
			periodEndMs: PERIOD_END,
			renewal: { interval: "year", intervalCount: 1 },
			discountEndMs: addMonths(PERIOD_END, 6).getTime(),
		});
		const carriedEnd = addMonths(NOW, months).getTime();

		expect(carriedEnd).toBeGreaterThan(PERIOD_END);
		expect(carriedEnd).toBeLessThanOrEqual(addMonths(PERIOD_END, 12).getTime());
	});
});
