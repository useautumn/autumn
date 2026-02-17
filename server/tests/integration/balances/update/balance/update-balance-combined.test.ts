import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-COMBINED1: current_balance + granted_balance together
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-combined1: current_balance + granted_balance together")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Track 30 usage first
	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

	// Update current_balance: 50 and granted_balance: 100
	// When BOTH are passed, granted_balance IS updated
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		granted_balance: 100,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50, // 100 - 50
		purchased_balance: 0,
	});

	// Update current_balance: 80 and granted_balance: 150
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
		granted_balance: 150,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 80,
		usage: 70, // 150 - 80
		purchased_balance: 0,
	});

	// Update to reset usage: current_balance: 100, granted_balance: 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 100,
		granted_balance: 100,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	// Verify DB sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-COMBINED2: current_balance + next_reset_at together
// NOTE: When only current_balance is passed (not granted_balance),
// granted_balance does NOT change - only usage changes
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-combined2: current_balance + next_reset_at together")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get original reset time and customer_entitlement_id
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const originalResetAt = initialCheck.balance?.reset?.resets_at ?? 0;
	const cusEntId = initialCheck.balance?.breakdown?.[0]?.id ?? "";

	expect(originalResetAt).toBeGreaterThan(Date.now());
	expect(cusEntId).toBeTruthy();

	// Update current_balance and next_reset_at together
	// NOTE: granted_balance stays at 100, only usage changes
	const newResetAt1 = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
		next_reset_at: newResetAt1,
		customer_entitlement_id: cusEntId,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged - only current_balance was passed
		current_balance: 50,
		usage: 50, // 100 - 50
	});

	// Verify reset time was updated
	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check1.balance?.reset?.resets_at).toBeCloseTo(newResetAt1, -3);

	// Update current_balance and push next_reset_at to 30 days
	const newResetAt2 = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		next_reset_at: newResetAt2,
		customer_entitlement_id: cusEntId,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Still unchanged
		current_balance: 200,
		usage: -100, // 100 - 200 = -100 (credit)
	});

	// Verify reset time
	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check2.balance?.reset?.resets_at).toBeCloseTo(newResetAt2, -3);

	// Verify DB sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 200,
		usage: -100,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-COMBINED3: current_balance + granted_balance + next_reset_at all together
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-combined3: current_balance + granted_balance + next_reset_at")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-combined3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Get customer_entitlement_id
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	const cusEntId = initialCheck.balance?.breakdown?.[0]?.id ?? "";

	// Track 30 usage first
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

	// Update all three values at once
	const newResetAt1 = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 days

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
		granted_balance: 150,
		next_reset_at: newResetAt1,
		customer_entitlement_id: cusEntId,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 150,
		current_balance: 80,
		usage: 70, // 150 - 80
		purchased_balance: 0,
	});

	// Verify reset time
	const check1 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check1.balance?.reset?.resets_at).toBeCloseTo(newResetAt1, -3);

	// Update all values to reset state
	const newResetAt2 = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 200,
		granted_balance: 200,
		next_reset_at: newResetAt2,
		customer_entitlement_id: cusEntId,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
		purchased_balance: 0,
	});

	// Verify reset time
	const check2 = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check2.balance?.reset?.resets_at).toBeCloseTo(newResetAt2, -3);

	// Verify DB sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 200,
		usage: 0,
	});
});
