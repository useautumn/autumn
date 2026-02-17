import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC1: Update monthly balance from 100 to 80 then to 120
// NEW BEHAVIOR: granted_balance does NOT change, only usage changes
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic1: update monthly balance from 100 to 80 then to 120")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Update current balance from 100 to 80
	// NEW: granted_balance stays 100, usage becomes 20
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 80,
		usage: 20, // 100 - 80
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer1Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer1Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 80,
		usage: 20,
		purchased_balance: 0,
	});

	// Update current balance from 80 to 120 (above granted)
	// NEW: granted_balance stays 100, usage becomes -20 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 120,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 120,
		usage: -20, // 100 - 120 = -20 (credit)
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer2Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer2Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
		purchased_balance: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC2: Update balance after tracking usage
// NEW BEHAVIOR: granted_balance does NOT change, usage adjusts
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic2: update balance after track")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic2",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Track 30 usage
	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
		purchased_balance: 0,
	});

	// Update current_balance to 50 after tracking
	// NEW: granted_balance stays 100, usage becomes 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50,
		usage: 50, // 100 - 50
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer1Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer1Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
		purchased_balance: 0,
	});

	// Update current_balance to 120 (above original granted)
	// NEW: granted_balance stays 100, usage becomes -20 (credit)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 120,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 120,
		usage: -20, // 100 - 120 = -20 (credit)
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer2Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer2Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 120,
		usage: -20,
		purchased_balance: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC3: Update balance to 0
// NEW BEHAVIOR: granted_balance does NOT change, usage = granted
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic3: update balance to 0")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic3",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Update current_balance to 0
	// NEW: granted_balance stays 100, usage becomes 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 0,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 0,
		usage: 100, // 100 - 0
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer1Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer1Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		usage: 100,
		purchased_balance: 0,
	});

	// Update current_balance from 0 to 50
	// NEW: granted_balance stays 100, usage becomes 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50,
		usage: 50, // 100 - 50
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer2Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer2Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
		purchased_balance: 0,
	});

	// Track 20 then update to 0
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	// Balance should be 30 now (50 - 20), usage = 70
	const beforeUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(beforeUpdate.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 30,
		usage: 70, // 50 usage + 20 track
	});

	// Update to 0
	// NEW: granted_balance stays 100, usage becomes 100
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 0,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 0,
		usage: 100, // 100 - 0
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer3Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer3Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 0,
		usage: 100,
		purchased_balance: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC4: Update lifetime (one-off) balance
// NEW BEHAVIOR: granted_balance does NOT change, usage adjusts
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic4: update lifetime (one-off) balance")}`, async () => {
	const messagesItem = items.lifetimeMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Verify initial balance with lifetime interval
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 100,
		usage: 0,
		purchased_balance: 0,
	});
	expect(initialCustomer.balances[TestFeature.Messages].reset?.interval).toBe(ResetInterval.OneOff);

	// Update current_balance from 100 to 50
	// NEW: granted_balance stays 100, usage becomes 50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 50,
		usage: 50, // 100 - 50
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer1Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer1Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
		purchased_balance: 0,
	});

	// Track 20 then update to 80
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	// Balance should be 30 now (50 - 20), usage = 70
	const beforeUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(beforeUpdate.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 30,
		usage: 70,
	});

	// Update to 80
	// NEW: granted_balance stays 100, usage becomes 20
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 80,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100, // Unchanged
		current_balance: 80,
		usage: 20, // 100 - 80
		purchased_balance: 0,
	});

	// Verify DB sync
	const customer2Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer2Db.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 80,
		usage: 20,
		purchased_balance: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC5: Update balance with decimal values (credits)
// NEW BEHAVIOR: granted_balance does NOT change, usage adjusts
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic5: update balance with decimal values (credits)")}`, async () => {
	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [creditsItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic5",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Update current_balance to decimal value 72.65
	// NEW: granted_balance stays 100, usage becomes 27.35
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 72.65,
	});

	const customer1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer1.balances[TestFeature.Credits].granted_balance).toBe(100); // Unchanged
	expect(customer1.balances[TestFeature.Credits].current_balance).toBeCloseTo(72.65, 2);
	expect(customer1.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2); // 100 - 72.65
	expect(customer1.balances[TestFeature.Credits].purchased_balance).toBe(0);

	// Verify DB sync
	const customer1Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer1Db.balances[TestFeature.Credits].granted_balance).toBe(100);
	expect(customer1Db.balances[TestFeature.Credits].current_balance).toBeCloseTo(72.65, 2);
	expect(customer1Db.balances[TestFeature.Credits].usage).toBeCloseTo(27.35, 2);

	// Track decimal value 27.35 then update to 50.50
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		value: 27.35,
	});

	// Balance should be 45.30 now (72.65 - 27.35), usage = 54.70
	const beforeUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(beforeUpdate.balances[TestFeature.Credits].current_balance).toBeCloseTo(45.3, 2);
	expect(beforeUpdate.balances[TestFeature.Credits].usage).toBeCloseTo(54.7, 2);

	// Update to 50.50
	// NEW: granted_balance stays 100, usage becomes 49.50
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 50.5,
	});

	const customer2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer2.balances[TestFeature.Credits].granted_balance).toBe(100); // Unchanged
	expect(customer2.balances[TestFeature.Credits].current_balance).toBeCloseTo(50.5, 2);
	expect(customer2.balances[TestFeature.Credits].usage).toBeCloseTo(49.5, 2); // 100 - 50.50
	expect(customer2.balances[TestFeature.Credits].purchased_balance).toBe(0);

	// Verify DB sync
	const customer2Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer2Db.balances[TestFeature.Credits].granted_balance).toBe(100);
	expect(customer2Db.balances[TestFeature.Credits].current_balance).toBeCloseTo(50.5, 2);
	expect(customer2Db.balances[TestFeature.Credits].usage).toBeCloseTo(49.5, 2);

	// Update to very small decimal 0.01
	// NEW: granted_balance stays 100, usage becomes 99.99
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 0.01,
	});

	const customer3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer3.balances[TestFeature.Credits].granted_balance).toBe(100); // Unchanged
	expect(customer3.balances[TestFeature.Credits].current_balance).toBeCloseTo(0.01, 2);
	expect(customer3.balances[TestFeature.Credits].usage).toBeCloseTo(99.99, 2); // 100 - 0.01

	// Verify DB sync
	const customer3Db = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customer3Db.balances[TestFeature.Credits].granted_balance).toBe(100);
	expect(customer3Db.balances[TestFeature.Credits].current_balance).toBeCloseTo(0.01, 2);
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-BASIC6: Sync delta with free/prepaid/arrear breakdowns
// Tests multiple breakdown types and how update distributes across them
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-basic6: sync delta with free/prepaid/arrear breakdowns")}`, async () => {
	// Free item - 10 messages (goes to granted_balance)
	const freeMessages = items.monthlyMessages({ includedUsage: 10 });
	// Prepaid item - 0 included, will purchase 20 credits (goes to purchased_balance)
	const prepaidMessages = items.prepaidMessages({ includedUsage: 0, price: 1, billingUnits: 1 });
	// Arrear (pay-per-use) item - 15 messages included, overage allowed
	const arrearMessages = items.consumableMessages({ includedUsage: 15, price: 0.1 });

	const productA = products.base({ id: "free-messages", items: [freeMessages] });
	const productB = products.base({ id: "prepaid-messages", items: [prepaidMessages], isAddOn: true });
	const productC = products.base({ id: "arrear-messages", items: [arrearMessages], isAddOn: true });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-basic6",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [productA, productB, productC] }),
		],
		actions: [
			s.attach({ productId: productA.id }),
			s.attach({ productId: productB.id, options: [{ feature_id: TestFeature.Messages, quantity: 20 }] }),
			s.attach({ productId: productC.id }),
		],
	});

	// Wait for Stripe webhooks
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Initial state: 45 total (10 granted + 20 purchased + 15 granted)
	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 25, // 10 free + 15 arrear
		current_balance: 45, // 25 granted + 20 purchased
		purchased_balance: 20,
		usage: 0,
	});

	// Check breakdown has 3 items
	const initialCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(initialCheck.balance?.breakdown).toHaveLength(3);

	// Track 15: exceeds Product A (10), spills into Product B prepaid
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 15,
	});

	const afterTrack1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack1.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 25,
		current_balance: 30,
		purchased_balance: 20,
		usage: 15,
	});

	// Track 10 more: partial usage from prepaid
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	const afterTrack2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack2.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 25,
		current_balance: 20,
		purchased_balance: 20,
		usage: 25,
	});

	// Track 25 more: exhausts remaining and creates overage on arrear
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 25,
	});

	const afterTrack3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack3.balances[TestFeature.Messages].usage).toBe(50);
	expect(afterTrack3.balances[TestFeature.Messages].current_balance).toBeLessThanOrEqual(5);

	// Update balance to 20
	// NEW: granted_balance does NOT change, usage adjusts
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 20,
	});

	const afterUpdate1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate1.balances[TestFeature.Messages].current_balance).toBe(20);
	// Usage changes to achieve the target current_balance
	// granted (25) + purchased (20) - usage = current (20)
	// usage = 25

	// Verify breakdown state
	const checkAfterUpdate = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total current_balance across breakdowns should sum to 20
	const totalCurrent = checkAfterUpdate.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.current_balance ?? 0),
		0,
	) ?? 0;
	expect(totalCurrent).toBe(20);

	// Verify database matches cache
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromCache = await autumnV2.customers.get<ApiCustomer>(customerId);
	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Messages].current_balance).toBe(
		customerFromCache.balances[TestFeature.Messages].current_balance,
	);

	// Update balance to -10 (negative): should create overage
	// For arrear items, current_balance floors at 0, overage goes to purchased_balance
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: -10,
	});

	const afterNegative = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterNegative.balances[TestFeature.Messages].current_balance).toBe(0); // Floored

	// Update balance back to positive (50)
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: 50,
	});

	const afterPositive = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterPositive.balances[TestFeature.Messages].current_balance).toBe(50);

	// Verify breakdowns
	const finalCheck = await autumnV2.check<CheckResponseV2>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	// Total current_balance should be 50
	const finalTotal = finalCheck.balance?.breakdown?.reduce(
		(sum, b) => sum + (b.current_balance ?? 0),
		0,
	) ?? 0;
	expect(finalTotal).toBe(50);

	// Final verification: database matches cache
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const finalFromCache = await autumnV2.customers.get<ApiCustomer>(customerId);
	const finalFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(finalFromDb.balances[TestFeature.Messages].current_balance).toBe(
		finalFromCache.balances[TestFeature.Messages].current_balance,
	);
});
