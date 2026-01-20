import { expect, test } from "bun:test";
import { CusExpand, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// BASIC CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: basic with ID")}`, async () => {
	const customerId = "create-basic-id";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Delete to test fresh create
	try {
		await autumnV1.customers.delete(customerId);
	} catch {}

	const data = await autumnV1.customers.create({
		id: customerId,
		name: "Test Customer",
		email: `${customerId}@example.com`,
		withAutumnId: false,
	});

	expect(data.id).toBe(customerId);
	expect(data.name).toBe("Test Customer");
	expect(data.email).toBe(`${customerId}@example.com`);
	expect(data.autumn_id).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("create: idempotent with same ID")}`, async () => {
	const customerId = "create-idempotent";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Delete first
	try {
		await autumnV1.customers.delete(customerId);
	} catch {}

	// First create
	const data1 = await autumnV1.customers.create({
		id: customerId,
		name: "Test Customer",
		email: `${customerId}@example.com`,
		withAutumnId: true,
	});

	// Second create - should return existing
	const data2 = await autumnV1.customers.create({
		id: customerId,
		name: "Test Customer",
		email: `${customerId}@example.com`,
		withAutumnId: true,
	});

	expect(data1.id).toBe(data2.id);
	expect(data1.autumn_id).toBe(data2.autumn_id);
});

test.concurrent(`${chalk.yellowBright("create: with expand params")}`, async () => {
	const customerId = "create-expand";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Delete first
	try {
		await autumnV1.customers.delete(customerId);
	} catch {}

	const data = await autumnV1.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
		withAutumnId: false,
		expand: [CusExpand.Invoices, CusExpand.TrialsUsed, CusExpand.Entities],
	});

	expect(data.invoices).toEqual([]);
	expect(data.trials_used).toEqual([]);
	expect(data.entities).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("create: concurrent same ID")}`, async () => {
	const customerId = "create-concurrent-id";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	// Delete first
	try {
		await autumnV1.customers.delete(customerId);
	} catch {}

	// Concurrent creates with same ID
	const [data1, data2] = await Promise.all([
		autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			withAutumnId: true,
		}),
		autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			withAutumnId: true,
		}),
	]);

	// Both should return same customer
	expect(data1.id).toBe(customerId);
	expect(data2.id).toBe(customerId);
	expect(data1.autumn_id).toBe(data2.autumn_id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// NULL ID BASIC TESTS
// More comprehensive null ID tests are in create-customer-null-id.test.ts
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: null ID with email")}`, async () => {
	const customerId = "create-null-id-email";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	const email = "create-null-id-test@example.com";

	const data = await autumnV1.customers.create({
		id: null,
		name: "Null ID Customer",
		email,
		withAutumnId: true,
	});

	expect(data.id).toBeNull();
	expect(data.name).toBe("Null ID Customer");
	expect(data.email).toBe(email);
	expect(data.autumn_id).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("create: null ID no email (error)")}`, async () => {
	const customerId = "create-null-id-no-email";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidCustomer,
		errMessage: "Email is required when `id` is null",
		func: async () => {
			await autumnV1.customers.create({
				id: null,
				name: "Null ID Customer",
				withAutumnId: false,
			});
		},
	});
});
