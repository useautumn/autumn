/**
 * Contract: an `excluded: true` override row on a usage-priced credits item
 * (overage allowed, usage_limit set) removes the feature outright. check
 * denies it and does not report it unlimited, track draws nothing, the
 * balance never goes negative and no overage accrues. Non-excluded features
 * still run into overage at their override rate.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("feature-override overage: an excluded feature draws nothing from usage-priced credits")}`,
	async () => {
		// Catalog Credits: Action1 = 0.2, Action2 = 0.6. 100 included, $1 per
		// credit overage up to 100 more (usage_limit 200).
		const creditsItem = withFeatureOverride(
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: 100,
				price: 1,
				maxPurchase: 100,
			}),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, excluded: true },
				],
			},
		);
		const pro = products.pro({ id: "override-overage", items: [creditsItem] });

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-overage-excluded",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Excluded: denied, and overage/usage pricing does not make it unlimited.
		const excludedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 1,
		});
		expect(excludedCheck.allowed).toBe(false);
		expect(excludedCheck.balance?.unlimited ?? false).toBe(false);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 500,
		});

		const afterExcluded =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterExcluded.features[TestFeature.Credits]).toMatchObject({
			balance: 100,
			usage: 0,
		});

		// Action1 runs into overage at the override rate: 300 * 0.5 = 150 credits.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 300,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 500,
		});

		const afterOverage =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterOverage.features[TestFeature.Credits]).toMatchObject({
			balance: -50,
			usage: 150,
		});

		await timeout(2000);
		const persisted = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(persisted.features[TestFeature.Credits]).toMatchObject({
			balance: -50,
			usage: 150,
		});
	},
	{ timeout: 180_000 },
);
