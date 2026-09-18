/** A coupon may not cover part of a shared Stripe product. */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CouponDurationType,
	type CreateRewardParams,
	ResetInterval,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const seedBaseWithPricedVariant = async ({
	autumn,
	baseId,
	variantId,
}: {
	autumn: { catalogV2: { update: (params: { plans: unknown[] }) => unknown } };
	baseId: string;
	variantId: string;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Scope Base",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
				variants: [{ variant_plan_id: variantId, name: "Scope Variant" }],
			},
		],
	});

const couponFor = ({
	id,
	planIds,
}: {
	id: string;
	planIds: string[] | null;
}): CreateRewardParams => ({
	coupon: {
		id,
		name: "Scoped Discount",
		type: RewardType.PercentageDiscount,
		value: 15,
		duration: { type: CouponDurationType.Months, length: 2 },
		plan_ids: planIds,
		promo_codes: [],
	},
});

test.concurrent(
	`${chalk.yellowBright("rewards scope: rejects a coupon covering only part of a shared Stripe product")}`,
	async () => {
		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId: "reward-scope-partial",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "reward-scope-partial@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const baseId = `scope_base_${Date.now()}`;
		const variantId = `scope_variant_${Date.now()}`;
		await seedBaseWithPricedVariant({
			autumn: autumnV2_3,
			baseId,
			variantId,
		});

		const partial = autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: `scope_partial_${Date.now()}`, planIds: [baseId] }),
		);

		await expect(partial).rejects.toThrow(new RegExp(variantId));
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards scope: accepts the full shared Stripe product group")}`,
	async () => {
		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId: "reward-scope-full",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "reward-scope-full@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const baseId = `scope_full_base_${Date.now()}`;
		const variantId = `scope_full_variant_${Date.now()}`;
		await seedBaseWithPricedVariant({
			autumn: autumnV2_3,
			baseId,
			variantId,
		});

		const created = await autumnV2_2.post(
			"/rewards.create",
			couponFor({
				id: `scope_full_${Date.now()}`,
				planIds: [baseId, variantId],
			}),
		);

		expect(
			(created as { coupon: { plan_ids: string[] } }).coupon.plan_ids,
		).toEqual(expect.arrayContaining([baseId, variantId]));
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards scope: apply-to-all bypasses the group rule")}`,
	async () => {
		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId: "reward-scope-all",
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "reward-scope-all@autumn.test",
				}),
				s.customer({}),
			],
			actions: [],
		});

		const baseId = `scope_all_base_${Date.now()}`;
		const variantId = `scope_all_variant_${Date.now()}`;
		await seedBaseWithPricedVariant({
			autumn: autumnV2_3,
			baseId,
			variantId,
		});

		const created = await autumnV2_2.post(
			"/rewards.create",
			couponFor({ id: `scope_all_${Date.now()}`, planIds: null }),
		);

		expect(created).toBeTruthy();
	},
);
