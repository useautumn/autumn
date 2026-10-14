import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CheckResponseV1,
	CustomerExpand,
	ErrCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("check-misc1: auto-create customer and entity when calling check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "check-misc1";
	const entityId = `${customerId}-entity-1`;

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

test.concurrent(`${chalk.yellowBright("check-misc3: customer_data updates name/email on cached customer via /check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-misc3",
		setup: [
			s.customer({ testClock: false, name: null, email: null }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.name).toBeFalsy();
	expect(customerBefore.email).toBeFalsy();

	await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		customer_data: {
			name: "Updated Name",
			email: "updated@example.com",
		},
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter.name).toBe("Updated Name");
	expect(customerAfter.email).toBe("updated@example.com");
});

test.concurrent(`${chalk.yellowBright("check-misc4: auto-create entity on cached customer via /check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-misc4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const entityId = `${customerId}-auto-entity`;

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

	const entity = await autumnV1.entities.get(customerId, entityId);
	expect(entity).toMatchObject({
		id: entityId,
		name: "Auto Entity",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CustomerExpand.Entities],
	});
	expect(customer.entities).toBeDefined();

	const createdEntity = customer.entities?.find((e) => e.id === entityId);
	expect(createdEntity).toBeDefined();
	expect(createdEntity?.name).toBe("Auto Entity");

	const checkRes2 = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entityId,
	});

	expect(checkRes2.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-misc5: v2.1 does not auto-create customer via /check")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "check-misc5";

	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [freeProd] })],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.check({
				customer_id: customerId,
				customer_data: {
					name: "check-misc5",
					email: "check-misc5@test.com",
				},
				feature_id: TestFeature.Messages,
				entity_id: `${customerId}-entity-1`,
				entity_data: {
					name: "Test Entity",
					feature_id: TestFeature.Users,
				},
			}),
	});

	await expectAutumnError({
		errCode: ErrCode.CustomerNotFound,
		func: async () => await autumnV2_1.customers.get(customerId),
	});
});
