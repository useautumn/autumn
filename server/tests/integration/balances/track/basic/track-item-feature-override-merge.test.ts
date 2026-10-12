/**
 * Contract: a plan item's feature_override.credit_schema merges into the
 * credit system's schema by metered_feature_id. A rate row overrides that
 * feature, an `excluded: true` row removes it (check denies it, track does
 * not draw on the credits), and every unlisted feature inherits the credit
 * system's rate — including features added to the credit system later.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import {
	type AttachParamsV1Input,
	FeatureType,
	ResetInterval,
} from "@autumn/shared";
import { deleteDbPlans } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { deleteDbFeatures } from "@tests/integration/catalog-v2/utils/expectCatalogFeatures.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Catalog Credits schema: Action1 = 0.2, Action2 = 0.6 (see v2Features.ts).

const creditsItemWithOverride = (featureOverride: FeatureConfigOverride) => {
	const item = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 100,
	});
	return {
		...item,
		config: { ...item.config, feature_override: featureOverride },
	};
};

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override-merge: an excluded row removes the feature from the plan's credits")}`,
	async () => {
		const plan = products.base({
			id: "free",
			items: [
				creditsItemWithOverride({
					schema: [
						{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
						{ metered_feature_id: TestFeature.Action2, excluded: true },
					],
				}),
			],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "item-feature-override-excluded",
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const excludedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
		});
		expect(excludedCheck.allowed).toBe(false);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});

		// Only Action1 draws: 40 * 0.5 = 20 credits. Action2 would add 10 * 0.6.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 80,
			usage: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override-merge: unlisted features inherit the credit system's rate")}`,
	async () => {
		const plan = products.base({
			id: "free",
			items: [
				creditsItemWithOverride({
					schema: [
						{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					],
				}),
			],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "item-feature-override-inherit",
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const inheritedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
		});
		expect(inheritedCheck.allowed).toBe(true);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});

		// Action1 at the override (40 * 0.5 = 20), Action2 at the catalog (10 * 0.6 = 6).
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 74,
			usage: 26,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-item-feature-override-merge: a feature added to the credit system later reaches overridden plans")}`,
	async () => {
		const overriddenFeatureId = uniqueTestId("ifo_merge_overridden");
		const laterFeatureId = uniqueTestId("ifo_merge_later");
		const creditSystemId = uniqueTestId("ifo_merge_credits");
		const planId = uniqueTestId("ifo_merge_plan");
		const featureIds = [overriddenFeatureId, laterFeatureId, creditSystemId];

		const { autumnV1, autumnV2_3, ctx, customerId } = await initScenario({
			customerId: uniqueTestId("ifo_merge_cus"),
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const meteredFeature = (featureId: string) => ({
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		const creditSystem = (credit_schema: object[]) => ({
			feature_id: creditSystemId,
			name: creditSystemId,
			type: FeatureType.CreditSystem,
			credit_schema,
		});

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(overriddenFeatureId),
					meteredFeature(laterFeatureId),
					creditSystem([
						{ metered_feature_id: overriddenFeatureId, credit_cost: 1 },
					]),
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								reset: { interval: ResetInterval.Month },
								feature_override: {
									credit_schema: [
										{ metered_feature_id: overriddenFeatureId, credit_cost: 2 },
									],
								},
							},
						],
					},
				],
			});
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: planId,
			});

			await autumnV2_3.catalogV2.update({
				features: [
					creditSystem([
						{ metered_feature_id: overriddenFeatureId, credit_cost: 1 },
						{ metered_feature_id: laterFeatureId, credit_cost: 3 },
					]),
				],
			});

			await autumnV1.track({
				customer_id: customerId,
				feature_id: laterFeatureId,
				value: 1,
			});
			await autumnV1.track({
				customer_id: customerId,
				feature_id: overriddenFeatureId,
				value: 1,
			});

			// laterFeature inherits 3; overriddenFeature keeps the plan's 2.
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expect(customer.features[creditSystemId]).toMatchObject({
				balance: 95,
				usage: 5,
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
