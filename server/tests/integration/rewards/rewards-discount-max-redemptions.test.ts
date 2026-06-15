import { expect, test } from "bun:test";
import { ErrCode, RewardType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

test(`${chalk.yellowBright("discount-max-redemptions-1: promo code with max 1 redemption blocks second customer")}`, async () => {
	const customerId = "disc-max-red-1";
	const otherCustomerId = "disc-max-red-1b";
	const promoCode = `DISCMAXRED1${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-red-1-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
		maxRedemptions: 1,
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ promotion_code: promoCode }],
	});

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	const promo = promos.data[0];
	expect(promo).toBeDefined();
	expect(promo.max_redemptions).toBe(1);
	expect(promo.times_redeemed).toBe(1);
	expect(promo.active).toBe(false);

	await expectAutumnError({
		errCode: ErrCode.ReferralCodeMaxRedemptionsReached,
		func: () =>
			autumnV2_2.billing.attach({
				customer_id: otherCustomerId,
				plan_id: pro.id,
				discounts: [{ promotion_code: promoCode }],
			}),
	});
});

test(`${chalk.yellowBright("discount-max-redemptions-2: promo code without limit stays unlimited")}`, async () => {
	const customerId = "disc-max-red-2";
	const otherCustomerId = "disc-max-red-2b";
	const promoCode = `DISCMAXRED2${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-red-2-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	expect(promos.data[0]).toBeDefined();
	expect(promos.data[0].max_redemptions).toBeNull();

	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ promotion_code: promoCode }],
	});

	await autumnV2_2.billing.attach({
		customer_id: otherCustomerId,
		plan_id: pro.id,
		discounts: [{ promotion_code: promoCode }],
	});

	const promosAfter = await ctx.stripeCli.promotionCodes.list({
		code: promoCode,
	});
	expect(promosAfter.data[0].times_redeemed).toBe(2);
	expect(promosAfter.data[0].active).toBe(true);
});
