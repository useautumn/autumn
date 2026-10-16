/**
 * Updating a reward deletes and recreates its Stripe coupon under the same id.
 *
 * Red (dev):  a zero discount or a Stripe-rejected create 500s after the old coupon is deleted.
 * Green:      zero is a 400 before Stripe, and a rejected create restores the old coupon.
 */

import { expect, test } from "bun:test";
import { ErrCode, RewardType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { getPromoCouponId } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts.js";

const expectCouponIntact = async ({
	stripeCli,
	couponId,
	promoCode,
}: {
	stripeCli: Stripe;
	couponId: string;
	promoCode: string;
}) => {
	const coupon = await stripeCli.coupons.retrieve(couponId);
	expect(coupon.percent_off).toBe(20);

	const promos = await stripeCli.promotionCodes.list({
		code: promoCode,
		active: true,
	});
	expect(promos.data.map(getPromoCouponId)).toEqual([couponId]);
};

test.concurrent(
	`${chalk.yellowBright("reward update swap: zero discount is a 400 and keeps the coupon")}`,
	async () => {
		const promoCode = `SWAPZERO${Date.now()}`;
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const reward = constructCoupon({
			id: "swap-zero-coupon",
			promoCode,
			discountType: RewardType.PercentageDiscount,
			discountValue: 20,
		});

		const { autumnV1, ctx } = await initScenario({
			customerId: "reward-swap-zero",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			func: () =>
				autumnV1.rewards.update({
					internalId: reward.id,
					reward: {
						...reward,
						discount_config: { ...reward.discount_config!, discount_value: 0 },
					},
				}),
		});

		await expectCouponIntact({
			stripeCli: ctx.stripeCli,
			couponId: reward.id,
			promoCode,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reward update swap: a Stripe-rejected create restores the old coupon")}`,
	async () => {
		const promoCode = `SWAPFAIL${Date.now()}`;
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const reward = constructCoupon({
			id: "swap-fail-coupon",
			promoCode,
			discountType: RewardType.PercentageDiscount,
			discountValue: 20,
		});

		const { autumnV1, ctx } = await initScenario({
			customerId: "reward-swap-fail",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		await expectAutumnError({
			func: () =>
				autumnV1.rewards.update({
					internalId: reward.id,
					reward: {
						...reward,
						discount_config: {
							...reward.discount_config!,
							discount_value: 150,
						},
					},
				}),
		});

		await expectCouponIntact({
			stripeCli: ctx.stripeCli,
			couponId: reward.id,
			promoCode,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("reward update swap: rewards.update restores the coupon when Stripe rejects a promo code")}`,
	async () => {
		const promoCode = `SWAPRPC${Date.now()}`;
		const strayCode = `SWAPSTRAY${Date.now()}`;
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const reward = constructCoupon({
			id: "swap-rpc-coupon",
			promoCode,
			discountType: RewardType.PercentageDiscount,
			discountValue: 20,
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "reward-swap-rpc",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		const strayCoupon = await ctx.stripeCli.coupons.create({
			percent_off: 5,
			duration: "once",
		});
		await ctx.stripeCli.promotionCodes.create({
			promotion: { type: "coupon", coupon: strayCoupon.id },
			code: strayCode,
		});

		await expect(
			autumnV2_2.post("/rewards.update", {
				reward_id: reward.id,
				coupon: { promo_codes: [{ code: promoCode }, { code: strayCode }] },
			}),
		).rejects.toThrow();

		await expectCouponIntact({
			stripeCli: ctx.stripeCli,
			couponId: reward.id,
			promoCode,
		});
	},
);
