/**
 * Contract: a customize patch that restates a credits item WITH its
 * feature_override must keep the override's dimension rates live.
 *
 * Red (current): after the patch, a dimensioned track prices at the flat
 * credit_amount (1) instead of the matched dimension rate (16) — the update
 * path keeps the schema but loses the dimension rules.
 * Green (after fix): the same track deducts 160, as it does pre-update.
 *
 * Attach-side coverage of the same field lives in
 * attach/custom-plan-patch/attach-customize-feature-override.test.ts, which
 * passes — so this is specific to the update path.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	FeatureConfigOverride,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 10_000;
const RAISED_GRANT = 12_000;

const dimensioned: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
		},
	],
} as unknown as FeatureConfigOverride;

test(
	`${chalk.yellowBright("update customize feature-override: dimension rate survives the patch")}`,
	async () => {
		const customerId = "probe-update-dimension";
		const creditsItem = items.monthlyCredits({ includedUsage: GRANT });
		const plan = products.pro({
			id: `${customerId}-plan`,
			items: [
				{
					...creditsItem,
					pooled: true,
					config: { ...creditsItem.config, feature_override: dimensioned },
				},
			],
		});

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		// Baseline: 2 large actions x 16 = 32 credits off the pool.
		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entities[1]!.id,
				feature_id: TestFeature.Action1,
				value: 2,
				properties: { size: "large" },
			},
			{ timeout: 4_000 },
		);
		const before = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(before.features[TestFeature.Credits]?.balance).toBe(GRANT - 32);

		// A hand-written customize that restates the item WITH its override.
		await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			plan_id: plan.id,
			customize: {
				remove_items: [{ feature_id: TestFeature.Credits }],
				add_items: [
					{
						feature_id: TestFeature.Credits,
						included: RAISED_GRANT,
						pooled: true,
						reset: { interval: ResetInterval.Month },
						feature_override: {
							credit_schema: [
								{
									metered_feature_id: TestFeature.Action1,
									credit_cost: 1,
									dimensions: {
										large: { match: { size: "large" }, credit_cost: 16 },
									},
								},
							],
						},
					},
				],
			},
		});

		// 10 large actions x 16 = 160 if the dimension survived; 10 if not.
		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entities[1]!.id,
				feature_id: TestFeature.Action1,
				value: 10,
				properties: { size: "large" },
			},
			{ skipCache: true, timeout: 4_000 },
		);
		const after = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(after.features[TestFeature.Credits]?.balance).toBe(
			RAISED_GRANT - 32 - 160,
		);
	},
	{ timeout: 120_000 },
);
