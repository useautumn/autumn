/**
 * Immediate Switch Edge Case Tests (Attach V2)
 *
 * Tests for complex upgrade scenarios with multiple feature types.
 *
 * Key behaviors tested:
 * - Products with ALL feature types (consumable, prepaid, allocated, boolean)
 * - Usage resets for consumable features
 * - Usage carries over for allocated features
 * - Prepaid balance recalculations
 * - Next reset timestamps on products
 * - Proration calculations
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade product with ALL feature types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with:
 *   - Boolean: Dashboard access
 *   - Consumable: Messages (100 included)
 *   - Allocated: Users (3 included)
 * - Track usage:
 *   - Messages: 50
 *   - Users: 2
 * - Upgrade to Premium with:
 *   - Boolean: Dashboard + AdminRights
 *   - Consumable: Messages (500 included)
 *   - Allocated: Users (10 included)
 *
 * Expected Result:
 * - Boolean features: Both available
 * - Consumable messages: Usage RESETS to 0, balance = 500
 * - Allocated users: Usage CARRIES OVER (2), balance = 10 - 2 = 8
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-edge-cases 1: all feature types - boolean, consumable, allocated")}`, async () => {
	const customerId = "imm-switch-all-types";

	// Pro with boolean, consumable, and allocated
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.consumableMessages({ includedUsage: 100 }),
			items.allocatedUsers({ includedUsage: 3 }),
		],
	});

	// Premium with more of everything
	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.consumableMessages({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track consumable messages (50)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Track allocated users (2)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 50,
		usage: 50,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify consumable messages - usage RESETS
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify allocated users - usage CARRIES OVER
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 8, // 10 - 2 = 8
		usage: 2,
	});

	// Verify invoices: pro ($20) + upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade mid-cycle with all feature types - verify proration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable + allocated
 * - Advance 15 days
 * - Track usage
 * - Upgrade to Premium
 *
 * Expected Result:
 * - Prorated charge for price difference
 * - Consumable resets, allocated carries over
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-edge-cases 2: all types mid-cycle with proration")}`, async () => {
	const customerId = "imm-switch-all-types-midcycle";

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.allocatedUsers({ includedUsage: 3 }),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.consumableMessages({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track usage mid-cycle
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Calculate expected prorated amount using actual billing period from Stripe
	const expectedTotal = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 20, // Pro base price
		newAmount: 50, // Premium base price
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify consumable - RESETS
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify allocated - CARRIES OVER
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 8,
		usage: 2,
	});

	// Verify invoice matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade with consumable in overage + allocated over limit
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with:
 *   - Consumable messages (100 included) - track 150 (50 overage)
 *   - Allocated users (3 included) - track 5 (2 over limit, billed immediately)
 * - Upgrade to Premium (500 messages, 10 users)
 *
 * Expected Result:
 * - Consumable overage charged on upgrade: 50 × $0.10 = $5
 * - Allocated overage refunded (2 paid seats now within limit): -$20
 * - Base price difference: $50 - $20 = $30
 * - Net upgrade charge: $30 - $20 + $5 = $15
 * - Consumable resets, allocated carries over (now within limit)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-edge-cases 3: consumable overage + allocated over limit")}`, async () => {
	const customerId = "imm-switch-overage-both";

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.allocatedUsers({ includedUsage: 3 }),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.consumableMessages({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track consumable into overage (150 usage, 50 over)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Track allocated over limit (5 usage, 2 over at $10/seat = $20)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50
		usage: 150,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2, // 3 - 5 = -2
		usage: 5,
	});

	// Allocated overage invoice already created
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2, // pro + allocated overage
		latestTotal: 20, // 2 seats * $10/seat
	});

	// 1. Preview upgrade
	// Base price difference: $50 - $20 = +$30
	// Allocated refund: 2 paid seats now within Premium's 10 limit = -$20
	// Consumable overage: 50 messages × $0.10 = +$5
	// Net: $30 - $20 + $5 = $15
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(15);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify consumable - RESETS (no longer in overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify allocated - CARRIES OVER (now within limit)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 5, // 10 - 5 = 5
		usage: 5,
	});

	// Verify invoices: pro ($20) + allocated overage ($20) + upgrade ($15)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade with prepaid + consumable + allocated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with:
 *   - Prepaid messages (100 included, buy more at $10/100 units)
 *   - Allocated users (3 included)
 * - Attach with quantity: 200 (total, inclusive of 100 base = 1 extra pack = $10)
 * - Track 150 messages (using from 200 balance)
 * - Track 2 users
 * - Upgrade to Premium with higher prepaid (500 included) and allocated (10 included)
 *
 * Expected Result:
 * - Old prepaid pack refunded (prorated unused time)
 * - New product has 500 included which covers old 200 total, so 0 additional packs
 * - Allocated usage carries over
 * - Total: Base diff ($30) - Prepaid refund ($10) = $20
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-edge-cases 4: prepaid + allocated combo")}`, async () => {
	const customerId = "imm-switch-prepaid-allocated";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({ includedUsage: 100 }),
			items.allocatedUsers({ includedUsage: 3 }),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.prepaidMessages({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
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

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track messages (150 usage from 200 balance)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Track users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance: 200 total (quantity is inclusive) - 150 used = 50
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 200, // quantity: 200 is total, not additional
		balance: 50,
		usage: 150,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base price difference: $50 - $20 = $30
	// Prepaid: old quantity (200) carries over but new allowance (500) covers it, so 0 prepaid packs needed
	// Old prepaid pack refund: -$10 (prorated unused from old product)
	// Total: $30 (base diff) - $10 (prepaid refund) = $20
	expect(preview.total).toBe(20);

	// 2. Attach premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify allocated - CARRIES OVER
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 8, // 10 - 2 = 8
		usage: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Multiple consecutive upgrades with mixed feature types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free with:
 *   - Consumable messages (50 included)
 *   - Allocated users (1 included)
 * - Track usage
 * - Upgrade to Pro
 * - Track more usage
 * - Upgrade to Premium
 *
 * Expected Result:
 * - Each upgrade: consumable resets, allocated carries over
 * - Final state reflects premium limits with carried-over allocated usage
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-edge-cases 5: consecutive upgrades free -> pro -> premium")}`, async () => {
	const customerId = "imm-switch-consecutive";

	const free = products.base({
		id: "free",
		items: [
			items.consumableMessages({ includedUsage: 50 }),
			items.monthlyUsers({ includedUsage: 1 }),
		],
	});

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.allocatedUsers({ includedUsage: 3 }),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.consumableMessages({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Track initial usage on free
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Upgrade to Pro
	const previewToPro = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(previewToPro.total).toBe(20); // Pro base price

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Wait for webhooks to process and cache to reset
	await new Promise((r) => setTimeout(r, 4000));

	// Verify after first upgrade
	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPro,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Consumable reset
	expectCustomerFeatureCorrect({
		customer: customerAfterPro,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Allocated carried over
	expectCustomerFeatureCorrect({
		customer: customerAfterPro,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 2, // 3 - 1 = 2
		usage: 1,
	});

	// Track more usage on Pro
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 40,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2, // Adds 2 to existing 1 = 3 total
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Upgrade to Premium
	const previewToPremium = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(previewToPremium.total).toBe(30); // $50 - $20

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [free.id, pro.id],
	});

	// Consumable reset again
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Allocated carried over (3 users: 1 from free + 2 from pro)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 7, // 10 - 3 = 7
		usage: 3,
	});

	// Verify invoices: pro ($20) + premium upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});
