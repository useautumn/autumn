import { expect, test } from "bun:test";

import {
	type ApiCustomer,
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiEntityV0,
	CustomerExpand,
	ErrCode,
	sumValues,
	type TrackResponseV2,
} from "@autumn/shared";
import { getCustomerEvents } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import {
	EVENTS_ARRIVAL_TIMEOUT_MS,
	expectCustomerEventsCorrect,
} from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

test.concurrent(`${chalk.yellowBright("track-misc1: track auto-creates customer and entity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "track-misc1";

	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId: "track-misc1" }),
			s.products({ list: [freeProd], prefix: customerId }),
		],
		actions: [],
	});

	const entityId = `${customerId}-entity-1`;

	await autumnV1.track({
		customer_id: customerId,
		customer_data: {
			name: "Test Customer",
			email: "test@test.com",
		},
		feature_id: TestFeature.Messages,
		entity_id: entityId,
		entity_data: {
			name: "Test Entity",
			feature_id: TestFeature.Users,
		},
		value: 5,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer).toMatchObject({
		id: customerId,
		name: "Test Customer",
		email: "test@test.com",
	});

	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	expect(entity).toMatchObject({
		id: entityId,
		name: "Test Entity",
	});

	const customerWithEntities = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ expand: [CustomerExpand.Entities] },
	);
	expect(customerWithEntities.entities).toBeDefined();
	expect(customerWithEntities.entities).toHaveLength(1);
	expect(customerWithEntities.entities?.[0].id).toBe(entityId);
	expect(customerWithEntities.entities?.[0].name).toBe("Test Entity");
});

test.concurrent(`${chalk.yellowBright("track-misc2: track event stores custom properties")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc2",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.track({
		customer_id: customerId,
		customer_data: {
			name: "track-misc2",
			email: "track-misc2@test.com",
		},
		feature_id: TestFeature.Messages,
		value: 5,
		properties: {
			hello: "world",
			foo: "bar",
		},
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 5, properties: { hello: "world", foo: "bar" } }],
	});
});

test.concurrent(`${chalk.yellowBright("track-misc3: track creates events when customer has no balance")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc3",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	const trackCount = Math.floor(Math.random() * 10) + 1;
	let totalValue = 0;

	await Promise.all(
		Array.from({ length: trackCount }, () => {
			const trackValue = Math.random() * 10;
			totalValue += trackValue;
			return autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: trackValue,
			});
		}),
	);

	await pollUntilAsserted({
		fetch: () => getCustomerEvents({ customerId }),
		assert: (events) => {
			expect(events).toHaveLength(trackCount);
			expect(
				sumValues(events.map((event) => event.value ?? 0)).toFixed(10),
			).toBe(totalValue.toFixed(10));
		},
		timeoutMs: EVENTS_ARRIVAL_TIMEOUT_MS,
	});
});

test.concurrent(`${chalk.yellowBright("track-misc4: track returns correct v1.2 response format")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackRes: TrackResponseV2 = await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	expect(trackRes).toMatchObject({
		id: "placeholder",
		code: "event_received",
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
});

test.concurrent(`${chalk.yellowBright("track-misc5: V1.2 properties.value maps to value field")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		properties: {
			value: 42.1532,
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	expect(customer.features[TestFeature.Messages].balance).toBe(
		new Decimal(100).sub(42.1532).toNumber(),
	);
	expect(customer.features[TestFeature.Messages].usage).toBe(42.1532);

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 42.1532 }],
	});
});

test.concurrent(`${chalk.yellowBright("track-misc7: track defaults to value 1 when no value provided")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc7",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	await expectCustomerEventsCorrect({ customerId, events: [{ value: 1 }] });
});

test.concurrent(`${chalk.yellowBright("track-misc8: V1.2 properties.value is removed from stored properties")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc8",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		properties: {
			value: 25,
			hello: "world",
			foo: "bar",
		},
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 25, properties: { hello: "world", foo: "bar" } }],
	});
});

test.concurrent(`${chalk.yellowBright("track-misc9: idempotency key prevents duplicate tracks")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const testRunId = Date.now().toString(36);
	const idempotencyKey1 = `test-idempotency-key-1-${testRunId}`;
	const idempotencyKey2 = `test-idempotency-key-2-${testRunId}`;

	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc9",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	const deductValue1 = 25.5;
	const expectedBalance1 = new Decimal(100).sub(deductValue1).toNumber();

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue1,
		idempotency_key: idempotencyKey1,
	});

	const customerAfterFirst =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterFirst.features[TestFeature.Messages]).toMatchObject({
		balance: expectedBalance1,
		usage: deductValue1,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: deductValue1, idempotencyKey: idempotencyKey1 }],
	});

	await expectAutumnError({
		errCode: ErrCode.DuplicateIdempotencyKey,
		func: async () => {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 30.75,
				idempotency_key: idempotencyKey1,
			});
		},
	});

	const customerAfterDupe =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterDupe.features[TestFeature.Messages].balance).toEqual(
		expectedBalance1,
	);

	await timeout(2000);
	const customerNonCached = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(customerNonCached.features[TestFeature.Messages].balance).toEqual(
		expectedBalance1,
	);

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: deductValue1, idempotencyKey: idempotencyKey1 }],
	});

	const deductValue2 = 15.25;
	const expectedBalance2 = new Decimal(expectedBalance1)
		.sub(deductValue2)
		.toNumber();

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: deductValue2,
		idempotency_key: idempotencyKey2,
	});

	const customerAfterSecond =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterSecond.features[TestFeature.Messages].balance).toEqual(
		expectedBalance2,
	);
});

test.concurrent(`${chalk.yellowBright("track-misc6: v2.1 does not auto-create customer via track")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "track-misc6";
	const entityId = `${customerId}-entity-1`;

	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId }), s.products({ list: [freeProd] })],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.track({
				customer_id: customerId,
				customer_data: {
					name: "Test Customer",
					email: "test@test.com",
				},
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				entity_data: {
					name: "Test Entity",
					feature_id: TestFeature.Users,
				},
				value: 5,
			}),
	});

	await expectAutumnError({
		errCode: ErrCode.CustomerNotFound,
		func: async () => await autumnV2_1.customers.get<ApiCustomerV5>(customerId),
	});
});

test(`${chalk.yellowBright("track-misc10: paid-allocated concurrent track serialized by distributed lock")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "track-misc10",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerBefore.balances[TestFeature.Users].current_balance).toBe(0);

	const promises = Array(5)
		.fill(null)
		.map(() =>
			autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 2,
			}),
		);

	const results = await Promise.allSettled(promises);
	const successCount = results.filter((r) => r.status === "fulfilled").length;

	expect(successCount).toEqual(1);

	await timeout(2000);
	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	const balance = customerAfter.balances[TestFeature.Users];

	const expectedUsage = successCount * 2;
	expect(balance.usage).toBe(expectedUsage);
	expect(balance.granted_balance).toBe(0);

	expect(customerAfter.invoices?.length).toBe(2);

	const expectedCurrentBalance =
		balance.granted_balance + balance.purchased_balance - balance.usage;
	expect(balance.current_balance).toBe(expectedCurrentBalance);

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	const customerFinal = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerFinal.balances[TestFeature.Users].usage).toBe(
		expectedUsage + 1,
	);

	await timeout(3000);
	const dbCustomer = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(dbCustomer.balances[TestFeature.Users].usage).toBe(expectedUsage + 1);
	expect(dbCustomer.invoices?.length).toBe(3);
});
