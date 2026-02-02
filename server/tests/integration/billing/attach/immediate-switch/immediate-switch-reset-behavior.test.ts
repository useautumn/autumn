/**
 * Immediate Switch Reset Behavior Tests (Attach V2)
 *
 * Tests for next_reset_at and usage reset behavior during upgrades.
 *
 * Key behaviors:
 * - Consumable: usage carries over, reset_at follows billing cycle
 * - Prepaid: usage RESETS, reset_at preserved
 * - Allocated: usage carries over, reset_at preserved
 * - Free to paid: reset_at follows new subscription cycle
 * - Monthly to annual: reset_at follows new cycle
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Consumable - same interval upgrade preserves reset_at
 *
 * Scenario:
 * - Pro monthly (100 messages)
 * - Track 30 usage mid-cycle
 * - Upgrade to Premium monthly (500 messages)
 *
 * Expected:
 * - next_reset_at stays the same (same billing interval)
 * - Usage carries over for consumable
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 1: consumable same interval preserves reset_at")}`, async () => {
	const customerId = "reset-consumable-same-interval";

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track some usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Get original reset_at before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages]?.next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Verify pre-upgrade state
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 70,
		usage: 30,
	});

	// Upgrade to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// KEY: next_reset_at should stay the same
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 470, // 500 - 30 (usage carries over for consumable)
		usage: 30,
		resetsAt: originalResetAt!,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREPAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prepaid - usage RESETS on upgrade, reset_at preserved
 *
 * Scenario:
 * - Pro with prepaid (200 purchased)
 * - Track 50 usage (balance = 150)
 * - Upgrade to premium with prepaid (300 purchased)
 *
 * Expected:
 * - Usage RESETS to 0 on upgrade (prepaid behavior)
 * - Balance = 300 (new purchased quantity)
 * - next_reset_at stays same
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 2: prepaid usage resets, reset_at preserved")}`, async () => {
	const customerId = "reset-prepaid-usage-resets";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Track 50 usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Get original reset_at before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Messages]?.next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Verify state before upgrade: balance = 150
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 50,
	});

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid diff: (3 - 2) packs * $10 = $10
	// Total: $40
	expect(preview.total).toBe(40);

	// Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// KEY: Usage RESETS on prepaid upgrade, reset_at preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
		resetsAt: originalResetAt!,
	});
});

/**
 * Prepaid vs Allocated comparison - different behaviors
 *
 * Scenario:
 * - Pro with BOTH prepaid messages and allocated users
 * - Track 50 messages and 3 users
 * - Upgrade to premium with both
 *
 * Expected:
 * - Messages (prepaid): usage RESETS
 * - Users (allocated): usage CARRIES OVER
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 3: prepaid resets, allocated carries over")}`, async () => {
	const customerId = "reset-prepaid-vs-allocated";

	const proPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proPrepaidMessages, proAllocatedUsers],
	});

	const premiumPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaidMessages, premiumAllocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Track both features
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 150, // 200 - 50
		usage: 50,
	});
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 2, // 5 - 3
		usage: 3,
	});

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	// Base diff: $50 - $20 = $30
	// Prepaid: same 2 packs, no diff
	expect(preview.total).toBe(30);

	// Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// KEY DIFFERENCE:
	// Messages (prepaid): RESETS - balance = 200, usage = 0
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Users (allocated): CARRIES OVER - balance = 10 - 3 = 7, usage = 3
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 7,
		usage: 3,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ALLOCATED TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Allocated - reset_at preserved, usage carries over
 *
 * Scenario:
 * - Pro with allocated (5 users included)
 * - Track 3 users
 * - Upgrade to Premium (10 users included)
 *
 * Expected:
 * - next_reset_at stays the same
 * - Usage carries over (allocated behavior)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 4: allocated preserves reset_at, usage carries over")}`, async () => {
	const customerId = "reset-allocated-carries-over";

	const proAllocated = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 3 users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Get original reset_at before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerBefore.features[TestFeature.Users]?.next_reset_at;
	expect(originalResetAt).toBeDefined();

	// Verify pre-upgrade state
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 2, // 5 - 3
		usage: 3,
	});

	// Upgrade to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// KEY: next_reset_at stays same, usage carries over
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 7, // 10 - 3 (usage carries over for allocated)
		usage: 3,
		resetsAt: originalResetAt!,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE TO PAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Free to Paid - reset_at follows new subscription cycle
 *
 * Scenario:
 * - Free product (50 messages)
 * - Track 20 usage
 * - Upgrade to Pro paid ($20/mo, 100 messages)
 *
 * Expected:
 * - next_reset_at changes to the new paid subscription's cycle end
 * - Should be approximately 1 month from now
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 5: free to paid sets new reset_at")}`, async () => {
	const customerId = "reset-free-to-paid";

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Track some usage on free
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Get free product's reset_at
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const freeResetAt =
		customerBefore.features[TestFeature.Messages]?.next_reset_at;
	expect(freeResetAt).toBeDefined();

	// Upgrade to paid
	const now = Date.now();
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// KEY: next_reset_at should be ~1 month from now (new subscription cycle)
	const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
	expect(newResetAt).toBeDefined();

	// Should be approximately 1 month from now (within 10 minutes tolerance)
	const expectedResetAt = now + ms.days(30);
	const diff = Math.abs(newResetAt! - expectedResetAt);
	expect(diff).toBeLessThanOrEqual(ms.minutes(10));

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 80, // 100 - 20 (usage carries over for consumable)
		usage: 20,
		resetsAt: expectedResetAt,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVAL CHANGE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Monthly to Annual - separate subscriptions, new reset_at
 *
 * Scenario:
 * - Pro monthly ($20/mo, 100 messages)
 * - Track 30 usage
 * - Upgrade to Pro annual ($200/year, 100 messages)
 *
 * Expected:
 * - next_reset_at changes to the annual cycle
 * - Dual subscriptions in Stripe, new reset cycle
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-reset 6: monthly to annual gets new reset_at")}`, async () => {
	const customerId = "reset-monthly-to-annual";

	const proMonthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [proMonthlyMessages],
	});

	const proAnnualMessages = items.monthlyMessages({ includedUsage: 100 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proMonthly, proAnnual] }),
		],
		actions: [s.billing.attach({ productId: proMonthly.id })],
	});

	// Track some usage
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Get monthly reset_at
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const monthlyResetAt =
		customerBefore.features[TestFeature.Messages]?.next_reset_at;
	expect(monthlyResetAt).toBeDefined();

	// Upgrade to annual
	const now = Date.now();
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proAnnual.id],
		notPresent: [proMonthly.id],
	});

	// KEY: next_reset_at should be ~1 year from now (annual cycle)
	const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
	expect(newResetAt).toBeDefined();

	// Should be approximately 1 year from now
	const expectedAnnualResetAt = now + ms.days(365);
	const diff = Math.abs(newResetAt! - expectedAnnualResetAt);
	expect(diff).toBeLessThanOrEqual(ms.minutes(10));

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 70, // 100 - 30 (usage carries over)
		usage: 30,
		resetsAt: expectedAnnualResetAt,
	});
});
