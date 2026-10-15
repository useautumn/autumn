/**
 * Contract: rolled-over credits on a plan item with a feature_override follow
 * that item's merged schema. After a reset, the overridden feature draws the
 * rollover at its override rate and the excluded feature cannot touch it.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type FeatureConfigOverride,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.monthlyCredits>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("rollover feature-override: rollovers follow the plan's merged schema")}`,
	async () => {
		// Catalog Credits: Action1 = 0.2, Action2 = 0.6.
		const creditsItem = withFeatureOverride(
			items.monthlyCredits({
				includedUsage: 100,
				rolloverConfig: {
					max_percentage: 100,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			}),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, excluded: true },
				],
			},
		);
		const free = products.base({ id: "free", items: [creditsItem] });

		const { customerId, autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "rollover-feature-override",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [
				s.billing.attach({ productId: free.id }),
				// 100 * 0.5 = 50 credits used, 50 unused roll over.
				s.track({ featureId: TestFeature.Action1, value: 100, timeout: 2000 }),
			],
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});

		const afterReset = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: afterReset,
			featureId: TestFeature.Credits,
			remaining: 150,
			usage: 0,
			rollovers: [{ balance: 50 }],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 50,
		});
		// 60 * 0.5 = 30 credits, drawn from the rollover first.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 60,
		});

		const afterTracks =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterTracks,
			featureId: TestFeature.Credits,
			remaining: 120,
			rollovers: [{ balance: 20 }],
		});
	},
	{ timeout: 120_000 },
);
