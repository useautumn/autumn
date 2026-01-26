import { expect, test } from "bun:test";

import {
	type ApiCustomerV3,
	type ApiEntityV0,
	CusExpand,
	sumValues,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { EventService } from "@/internal/api/events/EventService.js";

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC1: Auto-create customer and entity via track
// ═══════════════════════════════════════════════════════════════════

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

	// Verify customer was created with provided data
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer).toMatchObject({
		id: customerId,
		name: "Test Customer",
		email: "test@test.com",
	});

	// Verify entity was created with provided data
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);
	expect(entity).toMatchObject({
		id: entityId,
		name: "Test Entity",
	});

	// Verify customer.entities includes the created entity
	const customerWithEntities = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ expand: [CusExpand.Entities] },
	);
	expect(customerWithEntities.entities).toBeDefined();
	expect(customerWithEntities.entities).toHaveLength(1);
	expect(customerWithEntities.entities?.[0].id).toBe(entityId);
	expect(customerWithEntities.entities?.[0].name).toBe("Test Entity");
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC2: Track event stores properties
// ═══════════════════════════════════════════════════════════════════

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	await timeout(2000);

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id!,
		env: ctx.env,
	});

	expect(events).toHaveLength(1);
	expect(events?.[0].properties).toMatchObject({
		hello: "world",
		foo: "bar",
	});
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC3: Track creates events when balance is empty
// ═══════════════════════════════════════════════════════════════════

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	await timeout(2000);

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id ?? "",
		env: ctx.env,
	});

	expect(events).toHaveLength(trackCount);
	expect(sumValues(events.map((event) => event.value ?? 0)).toFixed(10)).toBe(
		totalValue.toFixed(10),
	);
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC4: Track v1.2 response format
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC5: V1.2 properties.value maps to value field
// ═══════════════════════════════════════════════════════════════════

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

	// Track using V1.2 legacy format with properties.value
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

	// Verify balance was deducted correctly
	expect(customer.features[TestFeature.Messages].balance).toBe(
		new Decimal(100).sub(42.1532).toNumber(),
	);
	expect(customer.features[TestFeature.Messages].usage).toBe(42.1532);

	await timeout(2000);

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id!,
		env: ctx.env,
	});

	expect(events).toHaveLength(1);
	expect(events[0].value).toBe(42.1532);
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC7: Track defaults to value: 1 when no value provided
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-misc7: track defaults to value 1 when no value provided")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc7",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Track without providing any value
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	await timeout(2000);

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id!,
		env: ctx.env,
	});

	expect(events).toHaveLength(1);
	expect(events[0].value).toBe(1);
});

// ═══════════════════════════════════════════════════════════════════
// TRACK-MISC8: V1.2 properties.value is removed from properties after extraction
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-misc8: V1.2 properties.value is removed from stored properties")}`, async () => {
	const { customerId, autumnV1 } = await initScenario({
		customerId: "track-misc8",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Track using V1.2 legacy format with properties.value and other properties
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		properties: {
			value: 25,
			hello: "world",
			foo: "bar",
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	await timeout(2000);

	const events = await EventService.getByCustomerId({
		db: ctx.db,
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id!,
		env: ctx.env,
	});

	expect(events).toHaveLength(1);
	expect(events[0].value).toBe(25);
	// Verify value was removed from properties but other props remain
	expect(events[0].properties).toMatchObject({
		hello: "world",
		foo: "bar",
	});
	expect(events[0].properties).not.toHaveProperty("value");
});
