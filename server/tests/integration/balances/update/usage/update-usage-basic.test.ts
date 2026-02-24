import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE1: Set usage on fresh product
// Formula: targetBalance = grantedBalance + prepaid - usage
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage1: set usage on fresh product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 30: targetBalance = 100 - 30 = 70
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 30,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
		purchased_balance: 0,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
		purchased_balance: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE2: Set usage after tracking (overwrites previous usage, decimals)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage2: set usage after tracking (decimals)")}`, async () => {
	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [creditsItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.track({ featureId: TestFeature.Credits, value: 40.5 }),
		],
	});

	// After track 40.5: granted=100, current=59.5, usage=40.5
	// Set usage to 27.35 (overwrites tracked 40.5): targetBalance = 100 - 27.35 = 72.65
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		usage: 27.35,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Credits].granted_balance).toBe(100);
	expect(customer.balances[TestFeature.Credits].current_balance).toBeCloseTo(
		72.65,
		2,
	);
	expect(customer.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2);
	expect(customer.balances[TestFeature.Credits].purchased_balance).toBe(0);

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Credits].current_balance).toBeCloseTo(
		72.65,
		2,
	);
	expect(customerDb.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE3: Set usage to 0 (reset after tracking)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage3: set usage to 0 (reset)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage3",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }),
		],
	});

	// After track 50: granted=100, current=50, usage=50
	// Set usage to 0: targetBalance = 100 - 0 = 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 0,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE4: Set usage on lifetime (one-off) balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage4: lifetime (one-off) balance")}`, async () => {
	const messagesItem = items.lifetimeMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage4",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Verify lifetime interval, then set usage to 40: targetBalance = 100 - 40 = 60
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages].reset?.interval).toBe(
		ResetInterval.OneOff,
	);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 40,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 60,
		usage: 40,
		purchased_balance: 0,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 60,
		usage: 40,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE5: Set usage greater than granted (overage)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage5: usage greater than granted (overage)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 130: targetBalance = 100 - 130 = -30
	// Overage absorbed into purchased_balance, current_balance floors at 0
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: 130,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		purchased_balance: 30,
		usage: 130,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		purchased_balance: 30,
		usage: 130,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE6: Set negative usage (credit/bonus)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage6: negative usage (credit/bonus)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage6",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to -20: targetBalance = 100 - (-20) = 120
	// Balance goes above granted — customer has a 20-unit credit
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		usage: -20,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
	});
});
