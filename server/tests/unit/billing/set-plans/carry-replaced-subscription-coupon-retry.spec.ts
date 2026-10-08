/** A retried backdate recreate reuses the repeating coupon copy its failed attempt made, rather than leaving it orphaned. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { msToSeconds, type StripeDiscountWithCoupon } from "@autumn/shared";
import { addMonths } from "date-fns";
import Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const NOW = Date.UTC(2026, 9, 2, 12);
const PERIOD_END = Date.UTC(2026, 9, 14, 12);

const createdCoupons = new Map<string, Stripe.Coupon>();

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		coupons: {
			create: async (params: Stripe.CouponCreateParams) => {
				const id = params.id ?? "";
				if (createdCoupons.has(id)) {
					throw new Stripe.errors.StripeInvalidRequestError({
						type: "invalid_request_error",
						code: "resource_already_exists",
						message: "Coupon already exists.",
					});
				}
				const coupon = { ...params, id } as Stripe.Coupon;
				createdCoupons.set(id, coupon);
				return coupon;
			},
			retrieve: async (id: string) => createdCoupons.get(id),
		},
	}),
}));

const { carryReplacedSubscriptionDiscounts } = await import(
	"@/internal/billing/v2/actions/setPlans/setup/carryReplacedSubscription/carryReplacedSubscriptionDiscounts"
);

const repeatingDiscount: StripeDiscountWithCoupon = {
	id: "di_repeating",
	end: msToSeconds(addMonths(PERIOD_END, 2).getTime()),
	source: {
		coupon: {
			id: "co_repeating",
			name: "Launch",
			percent_off: 20,
			duration: "repeating",
			duration_in_months: 6,
		} as Stripe.Coupon,
	},
};

const replacedStripeSubscription = {
	id: "sub_live",
	discounts: [repeatingDiscount],
	billing_cycle_anchor: msToSeconds(PERIOD_END),
	items: {
		data: [
			{
				current_period_end: msToSeconds(PERIOD_END),
				price: { recurring: { interval: "month", interval_count: 1 } },
			},
		],
	},
} as unknown as Stripe.Subscription;

const carryOnce = () =>
	carryReplacedSubscriptionDiscounts({
		ctx: { org: {}, env: "sandbox" } as AutumnContext,
		stripeDiscounts: [repeatingDiscount],
		replacedStripeSubscription,
		currentEpochMs: NOW,
		preview: false,
	});

describe("carryReplacedSubscriptionDiscounts retry", () => {
	afterAll(() => {
		mock.restore();
	});

	test("a retried carry reuses the coupon copy the first attempt created", async () => {
		const [firstAttempt] = await carryOnce();
		const [retry] = await carryOnce();

		expect(createdCoupons.size).toBe(1);
		expect(retry?.source.coupon.id).toBe(firstAttempt?.source.coupon.id);
	});
});
