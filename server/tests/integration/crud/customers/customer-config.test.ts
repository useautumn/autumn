import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER CONFIG — disable_pooled_balance
// Mirrors the billing_controls test style: cached API read, uncached API read,
// and a direct DB read to prove the field round-trips through every layer.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("customer config: create customer without config leaves disable_pooled_balance undefined")}`, async () => {
	const customerId = "customer-config-default";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Default",
		email: `${customerId}@example.com`,
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config).toBeDefined();
	expect(cached.config?.disable_pooled_balance).toBeUndefined();

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBeUndefined();

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	// DB row should be null/undefined when no config was provided.
	expect(fromDb.config?.disable_pooled_balance).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("customer config: create customer with disable_pooled_balance=true")}`, async () => {
	const customerId = "customer-config-create-true";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Create True",
		email: `${customerId}@example.com`,
		config: { disable_pooled_balance: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config?.disable_pooled_balance).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(true);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.config?.disable_pooled_balance).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: create customer with disable_pooled_balance=false")}`, async () => {
	const customerId = "customer-config-create-false";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Create False",
		email: `${customerId}@example.com`,
		config: { disable_pooled_balance: false },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config?.disable_pooled_balance).toBe(false);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(false);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.config?.disable_pooled_balance).toBe(false);
});

test.concurrent(`${chalk.yellowBright("customer config: update disable_pooled_balance from unset to true")}`, async () => {
	const customerId = "customer-config-update-true";
	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.config?.disable_pooled_balance).toBeUndefined();

	await autumnV2_1.customers.update(customerId, {
		config: { disable_pooled_balance: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config?.disable_pooled_balance).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(true);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.config?.disable_pooled_balance).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: update disable_pooled_balance from true to false")}`, async () => {
	const customerId = "customer-config-update-false";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Flip Off",
		email: `${customerId}@example.com`,
		config: { disable_pooled_balance: true },
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.config?.disable_pooled_balance).toBe(true);

	await autumnV2_1.customers.update(customerId, {
		config: { disable_pooled_balance: false },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config?.disable_pooled_balance).toBe(false);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(false);
});

test.concurrent(`${chalk.yellowBright("customer config: partial update leaves other fields untouched")}`, async () => {
	// Regression guard: mirrors the billing_controls pattern — updating config
	// shouldn't clobber name/email/send_email_receipts.
	const customerId = "customer-config-partial";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Original Name",
		email: `${customerId}@example.com`,
		send_email_receipts: true,
	});

	await autumnV2_1.customers.update(customerId, {
		config: { disable_pooled_balance: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.name).toBe("Original Name");
	expect(cached.email).toBe(`${customerId}@example.com`);
	expect(cached.send_email_receipts).toBe(true);
	expect(cached.config?.disable_pooled_balance).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: omitting config in update does not reset it")}`, async () => {
	const customerId = "customer-config-omit";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Persist",
		email: `${customerId}@example.com`,
		config: { disable_pooled_balance: true },
	});

	// Update something unrelated — config should survive.
	await autumnV2_1.customers.update(customerId, {
		name: "Config Persist Renamed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.name).toBe("Config Persist Renamed");
	expect(cached.config?.disable_pooled_balance).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: updating billing_controls alongside config does not clobber either")}`, async () => {
	// Cross-field regression: config and billing_controls are both partial
	// updates on the same row — updating one must not reset the other.
	const customerId = "customer-config-mixed";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Mixed",
		email: `${customerId}@example.com`,
		config: { disable_pooled_balance: true },
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			spend_limits: [],
		},
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config?.disable_pooled_balance).toBe(true);
	expect(cached.billing_controls?.spend_limits).toEqual([]);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config?.disable_pooled_balance).toBe(true);
	expect(uncached.billing_controls?.spend_limits).toEqual([]);
});
