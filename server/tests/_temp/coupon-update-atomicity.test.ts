/**
 * TDD repro for createStripeCoupon atomicity bug (athenahq YC500 incident).
 *
 * handleUpdateCoupon flow:
 *   1. handler deletes the existing Stripe coupon (handleUpdateCoupon.ts:91-94)
 *   2. createStripeCoupon runs:
 *        a. delete coupon (no-op now)
 *        b. broken pre-flight promo code "check": retrieves by code-string
 *           instead of promo ID (always 404s) AND any throw is swallowed by
 *           the same try/catch
 *        c. creates a NEW coupon with the attempted-update fields/metadata
 *        d. creates the promo code -> fails if a promo code with the same
 *           `code` already exists active in Stripe
 *   3. handler returns 400, DB rolls back -> DB has old state, Stripe coupon
 *      now has NEW/attempted-update state.
 *
 * Real symptom: athenahq's YC500 ended up with Stripe metadata
 * autumn_product_ids: ["lite-yearly"] while the DB still referenced 6 prices
 * spanning two products.
 *
 * Two cases tested:
 *   A. Conflict: promo code is already attached to a DIFFERENT Stripe coupon.
 *      Pre-flight must abort before any coupon mutation.
 *   B. Same coupon: promo code is attached to the reward's own coupon (normal
 *      update path). Pre-flight must NOT throw — the existing promo will be
 *      archived by the coupon delete and recreated cleanly.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateReward,
	RewardType,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

test(
	chalk.yellowBright(
		"coupon update atomicity A: promo code conflict on a different coupon must abort before coupon mutation",
	),
	async () => {
		const uniqueSuffix = Date.now();
		const conflictPromoCode = `atomicpc${uniqueSuffix}`;

		const reward: CreateReward = {
			id: "atomicity-reward-a",
			name: "Atomicity Reward",
			type: RewardType.FixedDiscount,
			promo_codes: [],
			discount_config: {
				discount_value: 100,
				duration_type: CouponDurationType.Forever,
				duration_value: 0,
				should_rollover: false,
				apply_to_all: false,
				price_ids: [],
			},
		};

		const pro = products.pro({
			id: "atomicity-pro-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV1 } = await initScenario({
			customerId: "coupon-atomicity-a",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		const prefixedRewardId = reward.id;

		const originalCoupon = await stripeCli.coupons.retrieve(prefixedRewardId);
		const originalAmountOff = originalCoupon.amount_off;
		expect(originalAmountOff).toBe(10000);

		const throwawayCoupon = await stripeCli.coupons.create({
			percent_off: 50,
			duration: "once",
			name: `throwaway-${uniqueSuffix}`,
		});
		await stripeCli.promotionCodes.create({
			promotion: {
				type: "coupon",
				coupon: throwawayCoupon.id,
			},
			code: conflictPromoCode,
		} as any);

		const rewardFromApi = await autumnV1.rewards.get(prefixedRewardId);

		const updateBody = {
			...rewardFromApi,
			discount_config: {
				...rewardFromApi.discount_config,
				discount_value: 200,
			},
			promo_codes: [{ code: conflictPromoCode }],
		};

		let updateFailed = false;
		try {
			await autumnV1.post(
				`/rewards/${rewardFromApi.internal_id}`,
				updateBody,
			);
		} catch (_) {
			updateFailed = true;
		}

		expect(updateFailed).toBe(true);

		const couponAfter = await stripeCli.coupons
			.retrieve(prefixedRewardId)
			.catch(() => null);

		if (couponAfter) {
			expect(couponAfter.amount_off).toBe(originalAmountOff);
		}
	},
);

test(
	chalk.yellowBright(
		"coupon update atomicity B: normal update where promo code stays on the same coupon must succeed",
	),
	async () => {
		const uniqueSuffix = Date.now() + 1;
		const ownPromoCode = `ownpc${uniqueSuffix}`;

		const reward: CreateReward = {
			id: "atomicity-reward-b",
			name: "Atomicity Reward",
			type: RewardType.FixedDiscount,
			promo_codes: [{ code: ownPromoCode }],
			discount_config: {
				discount_value: 100,
				duration_type: CouponDurationType.Forever,
				duration_value: 0,
				should_rollover: false,
				apply_to_all: false,
				price_ids: [],
			},
		};

		const pro = products.pro({
			id: "atomicity-pro-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV1 } = await initScenario({
			customerId: "coupon-atomicity-b",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		const prefixedRewardId = reward.id;

		const rewardFromApi = await autumnV1.rewards.get(prefixedRewardId);

		const updateBody = {
			...rewardFromApi,
			discount_config: {
				...rewardFromApi.discount_config,
				discount_value: 200,
			},
		};

		await autumnV1.post(
			`/rewards/${rewardFromApi.internal_id}`,
			updateBody,
		);

		const couponAfter = await stripeCli.coupons.retrieve(prefixedRewardId);
		expect(couponAfter.amount_off).toBe(20000);
	},
);

test(
	chalk.yellowBright(
		"coupon update atomicity C: pre-flight must NOT throw when active promo code is on the reward's own coupon",
	),
	async () => {
		const uniqueSuffix = Date.now() + 2;
		const ownPromoCode = `selfpc${uniqueSuffix}`;

		const reward: CreateReward = {
			id: "atomicity-reward-c",
			name: "Atomicity Reward C",
			type: RewardType.FixedDiscount,
			promo_codes: [{ code: ownPromoCode }],
			discount_config: {
				discount_value: 100,
				duration_type: CouponDurationType.Forever,
				duration_value: 0,
				should_rollover: false,
				apply_to_all: false,
				price_ids: [],
			},
		};

		const pro = products.pro({
			id: "atomicity-pro-c",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: "coupon-atomicity-c",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
				s.reward({ reward, productId: pro.id }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const prefixedRewardId = reward.id;

		const existingPromos = await stripeCli.promotionCodes.list({
			code: ownPromoCode,
			active: true,
			limit: 1,
		});
		expect(existingPromos.data.length).toBe(1);
		const promotion = existingPromos.data[0].promotion;
		const existingPromoCouponId =
			typeof promotion?.coupon === "string"
				? promotion.coupon
				: (promotion?.coupon?.id ?? null);
		expect(existingPromoCouponId).toBe(prefixedRewardId);

		const dbReward = await rewardRepo.get({
			db: ctx.db,
			idOrInternalId: prefixedRewardId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		if (!dbReward) throw new Error("reward not found in DB");

		const prices = await PriceService.getInIds({
			db: ctx.db,
			ids: dbReward.discount_config!.price_ids ?? [],
		});

		await createStripeCoupon({
			reward: dbReward,
			org: ctx.org,
			env: ctx.env,
			prices,
			logger: ctx.logger,
		});

		const couponAfter = await stripeCli.coupons.retrieve(prefixedRewardId);
		expect(couponAfter.amount_off).toBe(10000);
	},
);
