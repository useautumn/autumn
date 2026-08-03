import { expect, test } from "bun:test";
import {
	ApiRewardsListV0Schema,
	CouponDurationType,
	type CreateRewardParams,
	CreateRewardResponseSchema,
	EntitlementDuration,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("rewards.create: creates a plan-scoped coupon")}`,
	async () => {
		const pro = products.pro({
			id: "reward-create-pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const suffix = Date.now();
		const { autumnV2_2 } = await initScenario({
			customerId: `reward-create-coupon-${suffix}`,
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const params: CreateRewardParams = {
			coupon: {
				id: `coupon_${suffix}`,
				name: "Launch Discount",
				type: RewardType.PercentageDiscount,
				value: 25,
				duration: { type: CouponDurationType.Months, length: 3 },
				plan_ids: [pro.id],
				promo_codes: [
					{
						code: `LAUNCH${suffix}`,
						global_max_redemption: 50,
						first_time_transaction: true,
					},
				],
			},
		};

		const results = await Promise.allSettled([
			autumnV2_2.post("/rewards.create", params),
			autumnV2_2.post("/rewards.create", params),
		]);
		const fulfilled = results.filter(
			(result): result is PromiseFulfilledResult<unknown> =>
				result.status === "fulfilled",
		);
		expect(fulfilled).toHaveLength(1);
		expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);

		const created = CreateRewardResponseSchema.parse(fulfilled[0]?.value);
		if (!("coupon" in created)) throw new Error("Expected coupon response");
		expect(created).toMatchObject({
			coupon: {
				...params.coupon,
				plan_ids: [pro.id],
			},
		});

		const listed = ApiRewardsListV0Schema.parse(
			await autumnV2_2.post("/rewards.list", {}),
		);
		expect(listed.coupons).toContainEqual(created.coupon);
	},
);

test.concurrent(
	`${chalk.yellowBright("rewards.create: creates a feature grant")}`,
	async () => {
		const suffix = Date.now();
		const { autumnV2_2 } = await initScenario({
			customerId: `reward-create-grant-${suffix}`,
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({}),
			],
			actions: [],
		});
		const params: CreateRewardParams = {
			feature_grant: {
				id: `grant_${suffix}`,
				name: "Beta Grant",
				grants: [
					{
						feature_id: TestFeature.Credits,
						included: 1000,
						expiry: { type: EntitlementDuration.Month, length: 1 },
					},
					{
						feature_id: TestFeature.Dashboard,
						included: null,
						expiry: null,
					},
				],
				promo_codes: [{ code: `BETA${suffix}`, max_uses: 100 }],
			},
		};

		const created = CreateRewardResponseSchema.parse(
			await autumnV2_2.post("/rewards.create", params),
		);
		if (!("feature_grant" in created)) {
			throw new Error("Expected feature grant response");
		}
		expect(created).toMatchObject({ feature_grant: params.feature_grant });

		const listed = ApiRewardsListV0Schema.parse(
			await autumnV2_2.post("/rewards.list", {}),
		);
		expect(listed.feature_grants).toContainEqual(created.feature_grant);
	},
);
