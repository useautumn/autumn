import { expect, test } from "bun:test";
import type Stripe from "stripe";
import { resolvePromotionCode } from "@/external/stripe/coupons";

test("resolvePromotionCode preserves all currency-specific minimums", async () => {
	const coupon = {
		id: "coupon_multi_currency",
		object: "coupon",
		duration: "forever",
		valid: true,
	} as Stripe.Coupon;
	const stripeCli = {
		promotionCodes: {
			list: async () => ({
				data: [
					{
						id: "promo_multi_currency",
						promotion: { type: "coupon", coupon },
						restrictions: {
							first_time_transaction: false,
							minimum_amount: null,
							minimum_amount_currency: null,
							currency_options: {
								eur: { minimum_amount: 5000 },
								usd: { minimum_amount: 10000 },
							},
						},
					},
				],
			}),
		},
	} as unknown as Stripe;

	const result = await resolvePromotionCode({
		stripeCli,
		code: "MULTI",
	});

	expect(result.minimumAmount).toBeNull();
	expect(result.minimumAmountCurrency).toBeNull();
	expect(result.minimumAmountsByCurrency).toEqual({
		eur: 5000,
		usd: 10000,
	});
});
