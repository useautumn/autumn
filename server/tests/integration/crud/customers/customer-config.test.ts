import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER CONFIG — ignore_past_due
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("customer config: defaults to ignore_past_due=false on create")}`, async () => {
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
	expect(cached.config.ignore_past_due).toBe(false);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config.ignore_past_due).toBe(false);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.ignore_past_due).toBe(false);
});

test.concurrent(`${chalk.yellowBright("customer config: create customer with ignore_past_due=true")}`, async () => {
	const customerId = "customer-config-create-true";
	const { autumnV2_1, ctx } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Create True",
		email: `${customerId}@example.com`,
		config: { ignore_past_due: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config.ignore_past_due).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config.ignore_past_due).toBe(true);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: update ignore_past_due from false to true")}`, async () => {
	const customerId = "customer-config-update-true";
	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({})],
		actions: [],
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.config.ignore_past_due).toBe(false);

	await autumnV2_1.customers.update(customerId, {
		config: { ignore_past_due: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config.ignore_past_due).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config.ignore_past_due).toBe(true);

	const fromDb = await CusService.getFull({ ctx, idOrInternalId: customerId });
	expect(fromDb.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("customer config: update ignore_past_due from true to false")}`, async () => {
	const customerId = "customer-config-update-false";
	const { autumnV2_1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	await autumnV2_1.customers.create({
		id: customerId,
		name: "Config Flip Off",
		email: `${customerId}@example.com`,
		config: { ignore_past_due: true },
	});

	const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(before.config.ignore_past_due).toBe(true);

	await autumnV2_1.customers.update(customerId, {
		config: { ignore_past_due: false },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.config.ignore_past_due).toBe(false);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config.ignore_past_due).toBe(false);
});

test.concurrent(`${chalk.yellowBright("customer config: partial update leaves other fields untouched")}`, async () => {
	// Regression guard: mirrors the billing_controls pattern — updating config
	// shouldn't clobber name/email/billing_controls.
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
		config: { ignore_past_due: true },
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.name).toBe("Original Name");
	expect(cached.email).toBe(`${customerId}@example.com`);
	expect(cached.send_email_receipts).toBe(true);
	expect(cached.config.ignore_past_due).toBe(true);
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
		config: { ignore_past_due: true },
	});

	// Update something unrelated — config should survive.
	await autumnV2_1.customers.update(customerId, {
		name: "Config Persist Renamed",
	});

	const cached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(cached.name).toBe("Config Persist Renamed");
	expect(cached.config.ignore_past_due).toBe(true);

	const uncached = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(uncached.config.ignore_past_due).toBe(true);
});
