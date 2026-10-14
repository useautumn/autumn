import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setEntitySpendLimit } from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";

test.concurrent(
	`${chalk.yellowBright("entity-overrides-plan-spend: entity spend_limit overrides plan default; sibling inherits the plan")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "entity-overrides-plan-spend",
			items: [
				items.lifetimeMessages({
					includedUsage: 1000,
					entityFeatureId: TestFeature.Users,
				}),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
					entityFeatureId: TestFeature.Users,
				}),
			],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 50,
					},
				],
			},
		});

		const { autumnV2_1, customerId, entities } = await initScenario({
			customerId: "entity-overrides-plan-spend-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: perEntityProduct.id,
				}),
			],
		});

		await setEntitySpendLimit({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			overageLimit: 10,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 1100,
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 30,
					overage_behavior: "reject",
				}),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 1100,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 30,
			overage_behavior: "reject",
		});
	},
);
