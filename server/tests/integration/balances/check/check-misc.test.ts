import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CheckResponseV1,
	CustomerExpand,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// CHECK MISC 1: Auto-create customer and entity via /check
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-misc1: auto-create customer and entity when calling check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "check-misc1";
	const entityId = `${customerId}-entity-1`;

	// Only create products, no customer (check should auto-create)
	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [freeProd] })],
		actions: [],
	});

	await autumnV1.check({
		customer_id: customerId,
		customer_data: {
			name: "check-misc1",
			email: "check-misc1@test.com",
		},
		feature_id: TestFeature.Messages,
		entity_id: entityId,
		entity_data: {
			name: "Test Entity",
			feature_id: TestFeature.Users,
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer).toMatchObject({
		id: customerId,
		name: "check-misc1",
		email: "check-misc1@test.com",
	});

	const entity = await autumnV1.entities.get(customerId, entityId);
	expect(entity).toMatchObject({
		id: entityId,
		name: "Test Entity",
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK MISC 2: Get customer with entities returns created entity
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-misc2: get customer with entities returns created entity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "check-misc2";
	const entityId = `${customerId}-entity-1`;

	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [freeProd] })],
		actions: [],
	});

	// Auto-create customer and entity via check
	await autumnV1.check({
		customer_id: customerId,
		customer_data: {
			name: "check-misc2",
			email: "check-misc2@test.com",
		},
		feature_id: TestFeature.Messages,
		entity_id: entityId,
		entity_data: {
			name: "Test Entity",
			feature_id: TestFeature.Users,
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CustomerExpand.Entities],
	});

	expect(customer.entities).toBeDefined();
	expect(customer.entities).toHaveLength(1);
	expect(customer.entities?.[0].id).toBe(entityId);
	expect(customer.entities?.[0].name).toBe("Test Entity");
});

// ═══════════════════════════════════════════════════════════════════
// CHECK MISC 3: customer_data updates name/email when cache is set
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-misc3: customer_data updates name/email on cached customer via /check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	// Create customer WITHOUT name or email
	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-misc3",
		setup: [
			s.customer({ testClock: false, name: null, email: null }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Verify customer has no name or email
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.name).toBeFalsy();
	expect(customerBefore.email).toBeFalsy();

	// Call get customer to ensure it's in the cache
	await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Call /check with customer_data containing name and email
	await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_data: {
			name: "Updated Name",
			email: "updated@example.com",
		},
	});

	// Verify name and email are set on the customer
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter.name).toBe("Updated Name");
	expect(customerAfter.email).toBe("updated@example.com");
});

// ═══════════════════════════════════════════════════════════════════
// CHECK MISC 4: Auto-create entity works with existing cached customer
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-misc4: auto-create entity on cached customer via /check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	// Create customer and attach product
	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-misc4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Call get customer to ensure it's in the cache
	await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const entityId = `${customerId}-auto-entity`;

	// Call /check with entity_id that doesn't exist yet -- should auto-create
	const checkRes = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entityId,
		entity_data: {
			name: "Auto Entity",
			feature_id: TestFeature.Users,
		},
	});

	expect(checkRes.allowed).toBe(true);

	// Verify entity was created and is accessible
	const entity = await autumnV1.entities.get(customerId, entityId);
	expect(entity).toMatchObject({
		id: entityId,
		name: "Auto Entity",
	});

	// Verify customer has the entity in expanded response
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CustomerExpand.Entities],
	});
	expect(customer.entities).toBeDefined();

	const createdEntity = customer.entities?.find((e) => e.id === entityId);
	expect(createdEntity).toBeDefined();
	expect(createdEntity?.name).toBe("Auto Entity");

	// Call /check again with the same entity -- should still work from cache
	const checkRes2 = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entityId,
	});

	expect(checkRes2.allowed).toBe(true);
});
