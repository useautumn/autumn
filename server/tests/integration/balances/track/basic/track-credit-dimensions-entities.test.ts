/**
 * Contract: dimensions price an entity-scoped track the same as a customer-level
 * one. The entity decides whose balance is drawn from; the event's properties
 * decide the rate — the two mechanisms are orthogonal.
 */

import { test } from "bun:test";
import type { ApiEntityV2, FeatureConfigOverride } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("track-credit-dimensions-entities: each entity's balance is deducted at its own matched rate")}`,
	async () => {
		const customerId = "track-dimensions-entities";
		const creditItem = items.consumable({
			featureId: TestFeature.Credits,
			includedUsage: GRANT,
			entityFeatureId: TestFeature.Users,
		});
		const product = products.pro({
			id: "track-dimensions-entities",
			items: [
				items.freeUsers({ includedUsage: 3 }),
				{
					...creditItem,
					config: {
						...creditItem.config,
						feature_override: dimensionedAction1,
					},
				},
			],
		});

		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				// Entity 0 pays the dimensioned rate, entity 1 the multiplied one.
				s.track({
					featureId: TestFeature.Action1,
					value: 2,
					entityIndex: 0,
					properties: { size: "large" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					entityIndex: 1,
					properties: { size: "large", lifecycle: "spot" },
					timeout: 2_000,
				}),
			],
		});

		const [entityOne, entityTwo] = await Promise.all([
			autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[0].id),
			autumnV2_2.entities.get<ApiEntityV2>(customerId, entities[1].id),
		]);

		// 2 x 16 = 32 off entity one; 4 x 16 x 0.5 = 32 off entity two.
		expectBalanceCorrect({
			customer: entityOne,
			featureId: TestFeature.Credits,
			granted: GRANT,
			remaining: GRANT - 32,
			usage: 32,
		});
		expectBalanceCorrect({
			customer: entityTwo,
			featureId: TestFeature.Credits,
			granted: GRANT,
			remaining: GRANT - 32,
			usage: 32,
		});
	},
);
