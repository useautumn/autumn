import { test } from "bun:test";
import { expectEntityFeatureBalance } from "@tests/integration/balances/utils/spend-limit-utils/entitySpendLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { setEntityOverageAllowed } from "../../utils/overage-allowed-utils/entityOverageAllowedUtils.js";

test.concurrent(`${chalk.yellowBright("track-entity-overage-1: entity billing control enabled:true — entity usage exceeds granted")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-track",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-overage-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: true,
	});

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
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-overage-2: entity billing control enabled:false — caps at 0 for entity")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-disabled",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-overage-2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: false,
	});

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
		usage: 100,
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-overage-3: entity override takes precedence over customer control")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-override",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-overage-3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: false,
	});

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
		usage: 100,
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-overage-4: two entities, different overage controls")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-two",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-overage-4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: entityProduct.id, entityIndex: 0 }),
			s.attach({ productId: entityProduct.id, entityIndex: 1 }),
		],
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 80,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 80,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: 50,
		remaining: 0,
		usage: 80,
		breakdownLength: 1,
	});

	await expectEntityFeatureBalance({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[1].id,
		featureId: TestFeature.Messages,
		granted: 50,
		remaining: 0,
		usage: 50,
		breakdownLength: 1,
	});
});

test.concurrent(`${chalk.yellowBright("track-entity-overage-inherit-1: entity inherits customer enabled:true when entity has no billing control")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-inherit-track",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "track-entity-overage-inherit-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

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
		breakdownLength: 1,
	});
});
