import { expect, test } from "bun:test";
import { ErrCode, RewardType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

test(`${chalk.yellowBright("discount-max-red-update-1: update preserves remaining redemptions")}`, async () => {
	const customerId = "disc-max-upd-1";
	const otherIds = ["disc-max-upd-1b", "disc-max-upd-1c", "disc-max-upd-1d"];
	const promoCode = `DISCMAXUPD1${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-upd-1-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
		maxRedemptions: 3,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers(
				otherIds.map((id) => ({ id, paymentMethod: "success" as const })),
			),
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

	await autumnV1.rewards.update({ internalId: reward.id, reward });

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	const newestPromo = promos.data[0];
	expect(newestPromo.max_redemptions).toBe(2);
	expect(newestPromo.times_redeemed).toBe(0);
	expect(newestPromo.active).toBe(true);

	for (const id of otherIds.slice(0, 2)) {
		await autumnV2_2.billing.attach({
			customer_id: id,
			plan_id: pro.id,
			discounts: [{ promotion_code: promoCode }],
		});
	}

	await expectAutumnError({
		errCode: ErrCode.ReferralCodeMaxRedemptionsReached,
		func: () =>
			autumnV2_2.billing.attach({
				customer_id: otherIds[2],
				plan_id: pro.id,
				discounts: [{ promotion_code: promoCode }],
			}),
	});
});

test(`${chalk.yellowBright("discount-max-red-update-2: update after exhaustion does not recreate the code")}`, async () => {
	const customerId = "disc-max-upd-2";
	const otherCustomerId = "disc-max-upd-2b";
	const promoCode = `DISCMAXUPD2${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-upd-2-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
		maxRedemptions: 1,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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

	await autumnV1.rewards.update({ internalId: reward.id, reward });

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	expect(promos.data.every((promo) => !promo.active)).toBe(true);

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

test(`${chalk.yellowBright("discount-max-red-update-3: raising the limit on update extends remaining redemptions")}`, async () => {
	const customerId = "disc-max-upd-3";
	const otherCustomerId = "disc-max-upd-3b";
	const promoCode = `DISCMAXUPD3${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-upd-3-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
		maxRedemptions: 1,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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

	reward.promo_codes[0].global_max_redemption = 3;
	await autumnV1.rewards.update({ internalId: reward.id, reward });

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	expect(promos.data[0].max_redemptions).toBe(2);
	expect(promos.data[0].active).toBe(true);

	await autumnV2_2.billing.attach({
		customer_id: otherCustomerId,
		plan_id: pro.id,
		discounts: [{ promotion_code: promoCode }],
	});
});

test(`${chalk.yellowBright("discount-max-red-update-4: invalid max uses is rejected and leaves the live code intact")}`, async () => {
	const customerId = "disc-max-upd-4";
	const promoCode = `DISCMAXUPD4${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const reward = constructCoupon({
		id: "disc-max-upd-4-coupon",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
		maxRedemptions: 5,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	reward.promo_codes[0].global_max_redemption = 0;
	await expectAutumnError({
		errCode: ErrCode.InvalidReward,
		func: () => autumnV1.rewards.update({ internalId: reward.id, reward }),
	});

	const promos = await ctx.stripeCli.promotionCodes.list({ code: promoCode });
	expect(promos.data[0].active).toBe(true);
	expect(promos.data[0].max_redemptions).toBe(5);

	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ promotion_code: promoCode }],
	});
});
