/**
 * A customer-tier spend_limit applies per-entity on entity-scoped tracks. The
 * deduction passes target_entity_id, so get_available_overage_from_spend_limit
 * measures only that entity's overage — each entity gets the full overage_limit
 * against its own overage. entity[0] reaching its cap does not consume
 * entity[1]'s; each rejects only once it exceeds the cap itself.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";

test.concurrent(
	`${chalk.yellowBright("customer-spend-per-entity: a customer spend_limit applies per-entity on entity tracks")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "customer-spend-per-entity",
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
		});

		const { autumnV2_1, customerId, entities } = await initScenario({
			customerId: "customer-spend-per-entity-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		// entity[0]: exhaust 1100, then overage up to the cap (1120+10 == 25 spend,
		// the same volume that exhausts a 25 cap in track-customer-spend-limit1).
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 1120,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		// entity[0] at its cap -> rejects.
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		// entity[1] still has its OWN full cap of 25 — entity[0]'s overage did not
		// consume it. The same volume goes through, then entity[1] hits its own cap.
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 1120,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
