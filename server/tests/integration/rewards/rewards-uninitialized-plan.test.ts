/**
 * Red: coupon create and both update APIs reject an uninitialized scoped plan.
 * Green: all three initialize its Stripe resources and use refreshed prices.
 */
import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateRewardParams,
	RewardType,
	type UpdateRewardParams,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const globalCouponParams = ({ id }: { id: string }): CreateRewardParams => ({
	coupon: {
		id,
		name: "Global discount",
		type: RewardType.PercentageDiscount,
		value: 10,
		duration: { type: CouponDurationType.Forever, length: null },
		plan_ids: null,
		promo_codes: [],
	},
});

test.concurrent(
	`${chalk.yellowBright("rewards: plan-scoped coupons initialize missing Stripe resources")}`,
	async () => {
		const createPlan = products.base({
			id: "reward-create-uninitialized",
			items: [items.prepaidMessages({ includedUsage: 100 })],
		});
		const updatePlan = products.base({
			id: "reward-update-uninitialized",
			items: [items.prepaidMessages({ includedUsage: 100 })],
		});
		const legacyUpdatePlan = products.base({
			id: "reward-legacy-update-uninitialized",
			items: [items.prepaidMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "reward-uninitialized-plan",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({ testClock: false }),
				s.products({
					list: [createPlan, updatePlan, legacyUpdatePlan],
					createInStripe: false,
				}),
			],
			actions: [],
		});

		const globalCouponId = "global-coupon";
		const legacyGlobalCouponId = "legacy-global-coupon";
		await autumnV2_3.post(
			"/rewards.create",
			globalCouponParams({ id: globalCouponId }),
		);
		await autumnV2_3.post(
			"/rewards.create",
			globalCouponParams({ id: legacyGlobalCouponId }),
		);

		const legacyReward = await autumnV1.rewards.get(legacyGlobalCouponId);
		const legacyPlan = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: legacyUpdatePlan.id,
		});
		legacyReward.discount_config = {
			...legacyReward.discount_config!,
			apply_to_all: false,
			price_ids: legacyPlan.prices.map(({ id }) => id),
		};

		const updateResult = await Promise.allSettled([
			autumnV2_3.post("/rewards.update", {
				reward_id: globalCouponId,
				coupon: { plan_ids: [updatePlan.id] },
			} satisfies UpdateRewardParams),
		]);
		const legacyUpdateResult = await Promise.allSettled([
			autumnV1.rewards.update({
				internalId: legacyReward.internal_id,
				reward: legacyReward,
			}),
		]);
		const createResult = await Promise.allSettled([
			autumnV2_3.post("/rewards.create", {
				coupon: {
					id: "scoped-coupon",
					name: "Plan discount",
					type: RewardType.PercentageDiscount,
					value: 20,
					duration: { type: CouponDurationType.Forever, length: null },
					plan_ids: [createPlan.id],
					promo_codes: [],
				},
			} satisfies CreateRewardParams),
		]);

		const failures = [
			...updateResult,
			...legacyUpdateResult,
			...createResult,
		].flatMap((result) =>
			result.status === "rejected"
				? [
						result.reason instanceof Error
							? result.reason.message
							: result.reason,
					]
				: [],
		);
		expect(failures).toEqual([]);
	},
	60_000,
);
