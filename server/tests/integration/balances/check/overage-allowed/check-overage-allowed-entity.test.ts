import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { setEntityOverageAllowed } from "../../utils/overage-allowed-utils/entityOverageAllowedUtils.js";

test.concurrent(`${chalk.yellowBright("check-entity-overage-1: entity billing control enabled:true — allowed:true at 0 balance")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-check",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-overage-1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-entity-overage-2: entity billing control enabled:false — allowed:false at 0 balance")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-check-dis",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-overage-2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await setEntityOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-entity-overage-3: entity enabled:false overrides customer enabled:true")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-check-over",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-overage-3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
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

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-entity-overage-4: entity inherits customer enabled:true when entity has no billing control")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-inherit-check",
		items: [items.lifetimeMessages({ includedUsage: 50 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-overage-4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-entity-overage-5: entity inherits customer enabled:false when entity has no billing control")}`, async () => {
	const entityProduct = products.base({
		id: "entity-overage-inherit-check-dis",
		items: [items.consumableMessages({ includedUsage: 50, price: 0.5 })],
	});

	const { autumnV2_1, customerId, entities } = await initScenario({
		customerId: "check-entity-overage-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [entityProduct] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: entityProduct.id, entityIndex: 0 })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});
