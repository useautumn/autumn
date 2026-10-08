/** A discount redeemed from a promotion code is redeemed again from that code while Stripe still accepts it, else from its coupon. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const NOW = Date.UTC(2026, 9, 2, 12);
const PERIOD_END = Date.UTC(2026, 9, 14, 12);

const promotionCode = (overrides: Partial<Stripe.PromotionCode>) =>
	({
		id: "promo_launch",
		active: true,
		customer: null,
		expires_at: null,
		max_redemptions: null,
		times_redeemed: 1,
		restrictions: { first_time_transaction: false, minimum_amount: null },
		...overrides,
	}) as Stripe.PromotionCode;

let storedPromotionCode = promotionCode({});

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		promotionCodes: { retrieve: async () => storedPromotionCode },
	}),
}));

const { carryReplacedSubscriptionDiscounts } = await import(
	"@/internal/billing/v2/actions/setPlans/setup/carryReplacedSubscription/carryReplacedSubscriptionDiscounts"
);

const replacedStripeSubscription = {
	id: "sub_live",
	customer: "cus_live",
	discounts: [
		{
			id: "di_promo",
			end: null,
			promotion_code: "promo_launch",
			source: {
				coupon: {
					id: "co_launch",
					percent_off: 20,
					duration: "forever",
					valid: true,
				},
			},
		},
	],
	billing_cycle_anchor: msToSeconds(PERIOD_END),
	items: { data: [{ current_period_end: msToSeconds(PERIOD_END) }] },
} as unknown as Stripe.Subscription;

const carry = async (promotion: Partial<Stripe.PromotionCode>) => {
	storedPromotionCode = promotionCode(promotion);
	const [carried] = await carryReplacedSubscriptionDiscounts({
		ctx: { org: {}, env: "sandbox" } as AutumnContext,
		replacedStripeSubscription,
		currentEpochMs: NOW,
		preview: true,
	});
	return {
		promotionCodeId: carried?.promotionCodeId,
		couponId: carried?.source.coupon.id,
	};
};

describe("carryReplacedSubscriptionDiscounts promotion codes", () => {
	afterAll(() => {
		mock.restore();
	});

	test("a promotion code Stripe still accepts is redeemed again", async () => {
		expect(await carry({})).toEqual({
			promotionCodeId: "promo_launch",
			couponId: "co_launch",
		});
	});

	const unredeemable: [string, Partial<Stripe.PromotionCode>][] = [
		["used up", { max_redemptions: 1, times_redeemed: 1 }],
		["expired", { expires_at: msToSeconds(NOW) }],
		["inactive", { active: false }],
		["for another customer", { customer: "cus_other" }],
		[
			"first-time only",
			{
				restrictions: { first_time_transaction: true },
			} as Partial<Stripe.PromotionCode>,
		],
	];

	for (const [reason, promotion] of unredeemable) {
		test(`a ${reason} promotion code falls back to its coupon`, async () => {
			expect(await carry(promotion)).toEqual({
				promotionCodeId: undefined,
				couponId: "co_launch",
			});
		});
	}
});
