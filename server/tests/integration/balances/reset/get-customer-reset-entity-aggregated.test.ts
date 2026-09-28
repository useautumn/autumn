import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────
// Entity-level lazy reset: aggregated balance should reflect reset
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lazy reset (entity): aggregated balance correct after entity-level reset")}`, async () => {
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

	// Track 30 messages on entity 1, 20 on entity 2
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

	// Verify pre-reset state: customer aggregated = 200 - 50 = 150
	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: before,
		featureId: TestFeature.Messages,
		remaining: 150,
		usage: 50,
	});
	// Verify pre-reset state: customer aggregated = 200 - 50 = 150
	const beforeDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: beforeDb,
		featureId: TestFeature.Messages,
		remaining: 150,
		usage: 50,
	});

	// Expire all cusEnts for this feature so next read triggers lazy reset
	await expireAllCusEntsForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// After reset: each entity goes back to 100, aggregated = 200
	await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await autumnV2_2.entities.get(customerId, entities[0].id);
	await autumnV2_2.entities.get(customerId, entities[1].id);

	const after2 = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after2,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
	});

	// Verify each entity was reset
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get(customerId, entity.id);
		expect(entityData.features[TestFeature.Messages].balance).toBe(100);
	}
});
