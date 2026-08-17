/**
 * catalogV2.update — JobName.RewardMigration queuing (legacy parity).
 *
 * Rewards hold discount_config.price_ids; when a plan update replaces price
 * rows, the queued task remaps those ids onto the new rows (and recreates the
 * Stripe coupon when stripe ids changed).
 *
 * Contract:
 *   in-place base price change → reward price_ids remap to the new price row
 *   new_version mint with price change → reward price_ids remap to v2's row
 *
 * Red (current): V2 never queues the task; price_ids keep the deleted row ids.
 * Green (after): executeUpdateCatalogPlan queues RewardMigration per upsert
 * with price writes, after Stripe init.
 */

import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateRewardParams,
	isFixedPrice,
	type Reward,
	RewardType,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const getReward = async ({
	ctx,
	rewardId,
}: {
	ctx: AutumnContext;
	rewardId: string;
}): Promise<Reward | undefined> => {
	const rewards = await rewardRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inTypes: [RewardType.PercentageDiscount],
	});
	return rewards.find((reward) => reward.id === rewardId);
};

/** Queue-driven remap lands asynchronously — poll the reward row. */
const expectRewardPriceIdsCorrect = async ({
	ctx,
	rewardId,
	priceIds,
	label,
}: {
	ctx: AutumnContext;
	rewardId: string;
	priceIds: string[];
	label: string;
}) => {
	const deadline = Date.now() + 20_000;
	let lastSeen: string[] | undefined;
	while (Date.now() < deadline) {
		const reward = await getReward({ ctx, rewardId });
		lastSeen = reward?.discount_config?.price_ids ?? undefined;
		if (
			lastSeen &&
			lastSeen.length === priceIds.length &&
			priceIds.every((id) => lastSeen?.includes(id))
		) {
			return;
		}
		await timeout(1500);
	}
	expect(lastSeen?.sort(), `${label}: reward price_ids remapped`).toEqual(
		[...priceIds].sort(),
	);
};

const getFull = ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const createPlanScopedCoupon = async ({
	autumn,
	planId,
	suffix,
}: {
	autumn: { post: (path: string, body: unknown) => Promise<unknown> };
	planId: string;
	suffix: string;
}): Promise<string> => {
	const rewardId = `coupon_rmig_${suffix}`;
	const params: CreateRewardParams = {
		coupon: {
			id: rewardId,
			name: "Reward Migration Coupon",
			type: RewardType.PercentageDiscount,
			value: 25,
			duration: { type: CouponDurationType.Months, length: 3 },
			plan_ids: [planId],
			promo_codes: [{ code: `RMIG${suffix}` }],
		},
	};
	await autumn.post("/rewards.create", params);
	return rewardId;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: in-place base price change remaps reward price_ids")}`,
	async () => {
		const pro = products.pro({ id: "rmig-inplace-pro", items: [] });
		const suffix = `${Date.now()}`;
		const { autumnV2_3, ctx } = await initScenario({
			customerId: `reward-mig-inplace-${suffix}`,
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const rewardId = await createPlanScopedCoupon({
			autumn: autumnV2_3,
			planId: pro.id,
			suffix: `ip${suffix}`,
		});
		const before = await getFull({ ctx, planId: pro.id });
		const beforeBasePrice = before.prices.find(isFixedPrice)!;
		const reward = await getReward({ ctx, rewardId });
		expect(reward?.discount_config?.price_ids).toContain(beforeBasePrice.id);

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					price: { amount: 35, interval: "month" },
				},
			],
		});

		const after = await getFull({ ctx, planId: pro.id });
		const afterBasePrice = after.prices.find(isFixedPrice)!;
		expect(afterBasePrice.id).not.toBe(beforeBasePrice.id);

		await expectRewardPriceIdsCorrect({
			ctx,
			rewardId,
			priceIds: [afterBasePrice.id],
			label: "in-place base price change",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rewards: new_version mint remaps reward price_ids to v2")}`,
	async () => {
		const pro = products.pro({ id: "rmig-mint-pro", items: [] });
		const suffix = `${Date.now()}`;
		const { autumnV2_3, ctx } = await initScenario({
			customerId: `reward-mig-mint-${suffix}`,
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const rewardId = await createPlanScopedCoupon({
			autumn: autumnV2_3,
			planId: pro.id,
			suffix: `nv${suffix}`,
		});
		const v1 = await getFull({ ctx, planId: pro.id, version: 1 });
		const v1BasePrice = v1.prices.find(isFixedPrice)!;
		const reward = await getReward({ ctx, rewardId });
		expect(reward?.discount_config?.price_ids).toContain(v1BasePrice.id);

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					price: { amount: 50, interval: "month" },
					versioning: "new_version" as const,
				},
			],
		});

		const v2 = await getFull({ ctx, planId: pro.id, version: 2 });
		const v2BasePrice = v2.prices.find(isFixedPrice)!;
		expect(v2BasePrice.id).not.toBe(v1BasePrice.id);

		await expectRewardPriceIdsCorrect({
			ctx,
			rewardId,
			priceIds: [v2BasePrice.id],
			label: "new_version mint",
		});
	},
);
