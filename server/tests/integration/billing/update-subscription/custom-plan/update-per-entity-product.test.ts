import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PER-ENTITY PRODUCT UPDATE TESTS
// Tests for updating products that have per-entity feature balances (entity_feature_id)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Update free product to add per-entity feature
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("per-entity: add per-entity feature to free product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "pe-add-feature",
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Update to add per-entity messages feature
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [perEntityMessages],
	});

	// Verify customer balance is sum of all entity balances
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: perEntityMessages.included_usage * 2, // 500 * 2 entities
		balance: perEntityMessages.included_usage * 2,
		usage: 0,
	});

	// Verify each entity has its own balance
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			balance: perEntityMessages.included_usage,
			includedUsage: perEntityMessages.included_usage,
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Update free product to consumable per-entity, track into overage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("per-entity: add consumable per-entity feature and track overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "pe-cons-overage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Update to consumable per-entity messages ($0.10/message overage)
	const consumablePerEntity = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [consumablePerEntity],
	});

	// Verify initial entity balances
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			balance: consumablePerEntity.included_usage,
			includedUsage: consumablePerEntity.included_usage,
		});
	}

	// Track each entity into overage
	const entity1Usage = 1200; // 200 over
	const entity2Usage = 1500; // 500 over

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: entity2Usage,
		},
		{ timeout: 2000 },
	);

	// Verify entity balances are negative (in overage)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: consumablePerEntity.included_usage - entity1Usage, // -200
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: consumablePerEntity.included_usage - entity2Usage, // -500
	});

	// Verify customer total balance
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const expectedBalance =
		consumablePerEntity.included_usage * 2 - entity1Usage - entity2Usage;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: expectedBalance, // 2000 - 2700 = -700
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Update per-entity feature with increased included usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("per-entity: increase included usage preserves entity usage")}`, async () => {
	// Start with per-entity feature
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({ items: [perEntityMessages] });

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "pe-increase-inc",
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id, timeout: 2000 })],
	});

	// Track some usage on each entity
	const entity1Usage = 200;
	const entity2Usage = 300;

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: entity2Usage,
		},
		{ timeout: 2000 },
	);

	// Verify usage before update
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expect(entity1Before.features?.[TestFeature.Messages]?.balance).toBe(
		500 - entity1Usage,
	);

	// Update to increase included usage
	const updatedPerEntityMessages = items.monthlyMessages({
		includedUsage: 1000, // Increased from 500
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [updatedPerEntityMessages],
	});

	// Verify entity usage is preserved, balance reflects new included usage
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: updatedPerEntityMessages.included_usage,
		balance: updatedPerEntityMessages.included_usage - entity1Usage, // 1000 - 200 = 800
		usage: entity1Usage,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: updatedPerEntityMessages.included_usage,
		balance: updatedPerEntityMessages.included_usage - entity2Usage, // 1000 - 300 = 700
		usage: entity2Usage,
	});

	// Verify customer total
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedPerEntityMessages.included_usage * 2,
		balance:
			updatedPerEntityMessages.included_usage * 2 - entity1Usage - entity2Usage,
		usage: entity1Usage + entity2Usage,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Update billing model (consumable to prepaid) for per-entity features
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("per-entity: change from consumable to prepaid billing")}`, async () => {
	// Start with consumable per-entity feature
	const consumablePerEntity = items.consumableMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({ items: [consumablePerEntity] });

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "pe-cons-to-prep",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Track some usage on entity 1
	const entity1Usage = 200;
	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	// Update to prepaid per-entity ($10 per 100 units)
	const prepaidPerEntity = items.prepaidMessages({
		includedUsage: 500,
		price: 10,
		billingUnits: 100,
		entityFeatureId: TestFeature.Users,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidPerEntity],
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for prepaid units: 500 units / 100 billing_units * $10 = $50
	// (options.quantity is per-customer, not per-entity)
	expect(preview.total).toEqual(50);

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity balances - usage should be preserved
	// Each entity gets: included (500) + purchased share (500/2 = 250)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		// included (500) + purchased (500) - usage (200) = 550
		balance: 500 + 500 - entity1Usage,
		usage: entity1Usage,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		// included (500) + purchased (500) - usage (0) = 1000
		balance: 500 + 500,
		usage: 0,
	});

	// Verify customer total
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		// (500 + 250) * 2 entities - 200 usage = 1300
		balance: (500 + 500) * 2 - entity1Usage,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Update from free to pay-per-use per-entity features
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("per-entity: upgrade free to pay-per-use per-entity")}`, async () => {
	// Start with free per-entity feature
	const freePerEntity = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({ items: [freePerEntity] });

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "pe-free-to-ppu",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Track some usage before upgrade
	const entity1Usage = 50;
	const entity2Usage = 75;

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: entity1Usage,
		},
		{ timeout: 2000 },
	);

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: entity2Usage,
		},
		{ timeout: 2000 },
	);

	// Upgrade to pay-per-use per-entity ($0.10/message overage)
	const payPerUsePerEntity = items.consumableMessages({
		includedUsage: 100, // Same included usage
		entityFeatureId: TestFeature.Users,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [payPerUsePerEntity],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No immediate charge - consumable bills in arrears
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity balances preserved usage
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: payPerUsePerEntity.included_usage,
		balance: payPerUsePerEntity.included_usage - entity1Usage,
		usage: entity1Usage,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: payPerUsePerEntity.included_usage,
		balance: payPerUsePerEntity.included_usage - entity2Usage,
		usage: entity2Usage,
	});

	// Verify customer total
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: payPerUsePerEntity.included_usage * 2,
		balance:
			payPerUsePerEntity.included_usage * 2 - entity1Usage - entity2Usage,
		usage: entity1Usage + entity2Usage,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
