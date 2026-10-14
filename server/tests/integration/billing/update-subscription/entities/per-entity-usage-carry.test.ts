import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("entity version carry: consumable per-entity usage preserved after version update")}`, async () => {
	const includedUsage = 6000;

	const consumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.005,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const priceItem = items.monthlyPrice({ price: 30 });

	const pro = products.base({
		id: "pro",
		items: [consumablePerEntity, priceItem],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "ver-ent-carry-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	const entity1Usage = 6000;
	const entity2Usage = 6000;
	const entity3Usage = 10000;

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

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: entity3Usage,
		},
		{ timeout: 2000 },
	);

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expect(entity1Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity1Usage,
	);

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expect(entity2Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity2Usage,
	);

	const entity3Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expect(entity3Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity3Usage,
	);

	const v2ConsumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.015,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.products.update(pro.id, {
		items: [v2ConsumablePerEntity, priceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity1Usage,
		usage: entity1Usage,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity2Usage,
		usage: entity2Usage,
	});

	const entity3After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity3After,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - entity3Usage,
		usage: entity3Usage,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const totalUsage = entity1Usage + entity2Usage + entity3Usage;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: includedUsage * 3,
		balance: includedUsage * 3 - totalUsage,
		usage: totalUsage,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("entity version carry: free metered per-entity usage preserved after version update")}`, async () => {
	const includedUsage = 6000;

	const perEntityMessages = items.monthlyMessages({
		includedUsage,
		entityFeatureId: TestFeature.Users,
	});

	const free = products.base({
		id: "free",
		items: [perEntityMessages],
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ver-ent-carry-free",
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	const entity1Usage = 1000;
	const entity2Usage = 3000;
	const entity3Usage = 6000;

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

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: entity3Usage,
		},
		{ timeout: 2000 },
	);

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expect(entity1Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity1Usage,
	);

	const entity3Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expect(entity3Before.features?.[TestFeature.Messages]?.balance).toBe(
		includedUsage - entity3Usage,
	);

	const v2IncludedUsage = 8000;
	const v2PerEntityMessages = items.monthlyMessages({
		includedUsage: v2IncludedUsage,
		entityFeatureId: TestFeature.Users,
	});

	await autumnV1.products.update(free.id, {
		items: [v2PerEntityMessages],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		version: 2,
	});

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity1Usage,
		usage: entity1Usage,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity2Usage,
		usage: entity2Usage,
	});

	const entity3After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[2].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity3After,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage,
		balance: v2IncludedUsage - entity3Usage,
		usage: entity3Usage,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const totalUsage = entity1Usage + entity2Usage + entity3Usage;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: v2IncludedUsage * 3,
		balance: v2IncludedUsage * 3 - totalUsage,
		usage: totalUsage,
	});
});

test.concurrent(`${chalk.yellowBright("entity version carry: same grant version update does not reset entity balances")}`, async () => {
	const includedUsage = 6000;

	const consumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.005,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const priceItem = items.monthlyPrice({ price: 30 });

	const pro = products.base({
		id: "pro",
		items: [consumablePerEntity, priceItem],
	});

	const entityCount = 5;
	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "ver-ent-carry-same",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	for (let i = 0; i < entityCount; i++) {
		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				value: includedUsage,
			},
			{ timeout: 2000 },
		);
	}

	for (let i = 0; i < entityCount; i++) {
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		expect(entityBefore.features?.[TestFeature.Messages]?.balance).toBe(0);
	}

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(0);

	const v2ConsumablePerEntity = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage,
		price: 0.015,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
	});
	const v2PriceItem = items.monthlyPrice({ price: 30 });

	await autumnV1.products.update(pro.id, {
		items: [v2ConsumablePerEntity, v2PriceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	for (let i = 0; i < entityCount; i++) {
		const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		expectCustomerFeatureCorrect({
			customer: entityAfter,
			featureId: TestFeature.Messages,
			includedUsage,
			balance: 0,
			usage: includedUsage,
		});
	}

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: includedUsage * entityCount,
		balance: 0,
		usage: includedUsage * entityCount,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
