/**
 * Contract: a plan item's feature_override.credit_schema row with
 * `excluded: true` removes that metered feature from the plan's credits —
 * check denies it and track does not draw on the credit balance — while the
 * override's rate rows keep applying.
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
