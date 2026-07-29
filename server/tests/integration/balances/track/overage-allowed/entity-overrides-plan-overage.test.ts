/**
 * overage_allowed waterfall: an entity's own entry overrides the plan default; a
 * sibling without one inherits the plan. Plan-default false; entity[0] sets
 * true; entity[1] has none.
 *   - entity[0]: overage enabled (its true overrides the plan false).
 *   - entity[1]: overage disabled (inherits the plan false), caps at granted.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectEntityFeatureBalance } from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";
import { setEntityOverageAllowed } from "../../utils/overage-allowed-utils/entityOverageAllowedUtils.js";

test.concurrent(
	`${chalk.yellowBright("entity-overrides-plan-overage: entity overage_allowed:true overrides plan false; sibling inherits plan")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "entity-overrides-plan-overage",
			items: [
				items.lifetimeMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
			billingControls: {
				overage_allowed: [
					{ feature_id: TestFeature.Messages, enabled: false },
				],
			},
		});

		const { autumnV2_1, customerId, entities } = await initScenario({
			customerId: "entity-overrides-plan-overage-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: perEntityProduct.id,
				}),
			],
		});

		// entity[0] overrides the plan false with its own true.
		await setEntityOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		// entity[0]: overage enabled -> usage exceeds the granted 100.
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 130,
		});
		await expectEntityFeatureBalance({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 130,
		});

		// entity[1]: inherits plan false -> caps at the granted 100.
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 130,
		});
		await expectEntityFeatureBalance({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 100,
		});
	},
);
