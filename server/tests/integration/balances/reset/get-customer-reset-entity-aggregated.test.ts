import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("lazy reset (entity): aggregated balance correct after entity-level reset")}`,
	async () => {
		const messagesItem = items.monthlyMessages({
			includedUsage: 100,
		});
		const base = products.base({ items: [messagesItem] });

		const { customerId, autumnV1, autumnV2_2, ctx, entities } =
			await initScenario({
				customerId: "reset-entity-agg",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.products({ list: [base] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: base.id, entityIndex: 0 }),
					s.attach({ productId: base.id, entityIndex: 1 }),
				],
			});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		if (isBalanceWorkerRoute()) {
			for (const [index, trackedUsage] of [30, 20].entries()) {
				const entityBefore = await autumnV2_2.entities.get<ApiEntityV2>(
					customerId,
					entities[index].id,
				);
				expectBalanceCorrect({
					customer: entityBefore,
					featureId: TestFeature.Messages,
					remaining: 100 - trackedUsage,
					usage: trackedUsage,
				});
			}
		} else {
			const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer: before,
				featureId: TestFeature.Messages,
				remaining: 150,
				usage: 50,
			});
			const beforeDb = await autumnV2_2.customers.get<ApiCustomerV5>(
				customerId,
				{
					skip_cache: "true",
				},
			);
			expectBalanceCorrect({
				customer: beforeDb,
				featureId: TestFeature.Messages,
				remaining: 150,
				usage: 50,
			});
		}

		await expireAllCusEntsForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await autumnV2_2.entities.get(customerId, entities[0].id);
		await autumnV2_2.entities.get(customerId, entities[1].id);

		if (!isBalanceWorkerRoute()) {
			const after2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer: after2,
				featureId: TestFeature.Messages,
				remaining: 200,
				usage: 0,
			});
		}

		for (const entity of entities) {
			const entityData = await autumnV1.entities.get(customerId, entity.id);
			expect(entityData.features[TestFeature.Messages].balance).toBe(100);
		}
	},
);
