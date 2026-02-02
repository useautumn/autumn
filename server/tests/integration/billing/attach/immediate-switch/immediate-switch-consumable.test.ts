/**
 * Immediate Switch Consumable Tests (Attach V2)
 *
 * Tests for upgrades involving consumable (pay-per-use) features.
 *
 * Key behaviors:
 * - Overage is NOT charged on upgrade (billed at cycle end)
 * - Usage resets after upgrade
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro with consumable, track usage into overage, upgrade to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/overage)
 * - Track 150 usage (50 overage)
 * - Upgrade to premium with consumable (500 included)
 *
 * Expected Result:
 * - Overage NOT charged on upgrade (billed at cycle end)
 * - Usage resets to 0 after upgrade
 * - Balance = 500 (premium's included)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 1: overage, upgrade resets")}`, async () => {
	const customerId = "imm-switch-consumable-overage";

	const proConsumable = items.consumableMessages({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const premiumConsumable = items.consumableMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumConsumable],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id, timeout: 5000 })],
	});

	// Track 150 usage (50 overage at $0.10 = $5 potential overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify usage before upgrade (in overage)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 50, // 200 - 150 = 50 (overage)
		usage: 150,
	});

	// 1. Preview upgrade - overage NOT charged on upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Only price difference: $50 - $20 = $30 (no overage charge)
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify invoices: pro ($20) + upgrade ($30) - no overage invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multiple consumables with overage, upgrade charges overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with two consumable features:
 *   - Messages (100 included, $0.10/overage)
 *   - Words (200 included, $0.05/overage)
 * - Track both into overage:
 *   - Messages: 150 usage (50 overage × $0.10 = $5)
 *   - Words: 300 usage (100 overage × $0.05 = $5)
 * - Upgrade to premium with both consumables (500 messages, 1000 words)
 *
 * Expected Result:
 * - Overage invoice created on upgrade ($10 total)
 * - Usage resets to 0 after upgrade
 * - Premium is active with new balances
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 2: multiple with overage, upgrade charges")}`, async () => {
	const customerId = "imm-switch-multi-consumable-overage";

	// Pro with 2 consumable features
	const proMessagesConsumable = items.consumableMessages({
		includedUsage: 100,
	});
	const proWordsConsumable = items.consumableWords({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesConsumable, proWordsConsumable],
	});

	// Premium with higher limits
	const premiumMessagesConsumable = items.consumableMessages({
		includedUsage: 500,
	});
	const premiumWordsConsumable = items.consumableWords({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesConsumable, premiumWordsConsumable],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track messages into overage: 150 usage (50 overage × $0.10 = $5)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Track words into overage: 300 usage (100 overage × $0.05 = $5)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 300,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify messages usage before upgrade (in overage)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50 (overage)
		usage: 150,
	});

	// Verify words usage before upgrade (in overage)
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: -100, // 200 - 300 = -100 (overage)
		usage: 300,
	});

	// 1. Preview upgrade
	// Price difference: $50 - $20 = $30
	// Overage: messages $5 + words $5 = $10
	// Total: $40
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(40);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify messages usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify words usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify invoices: pro ($20) + upgrade with overage ($40)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 40,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Consumable mid-cycle upgrade - arrear charges NOT prorated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable words (200 included, $0.05/overage)
 * - Track 300 usage (100 overage × $0.05 = $5)
 * - Advance 15 days (mid-cycle)
 * - Upgrade to premium ($50/mo)
 *
 * Expected Result:
 * - Base price is prorated: ($50 - $20) × 0.5 ≈ $15
 * - Arrear overage charge is NOT prorated: $5 (full amount)
 * - Total ≈ $15 + $5 = $20
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-consumable 3: mid-cycle, arrear not prorated")}`, async () => {
	const customerId = "imm-switch-consumable-midcycle";

	const proWordsConsumable = items.consumableWords({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proWordsConsumable],
	});

	const premiumWordsConsumable = items.consumableWords({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumWordsConsumable],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Words, value: 300 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Verify usage before upgrade (in overage)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: -100, // 200 - 300 = -100 (overage)
		usage: 300,
	});

	// Calculate prorated base price difference using actual billing period from Stripe
	const proratedBaseDiff = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 20, // Pro base price
		newAmount: 50, // Premium base price
	});

	// Arrear overage is NOT prorated - full $5 charge
	const arrearOverage = 5; // 100 overage × $0.05

	// Expected total = prorated base diff + full arrear overage
	const expectedTotal = proratedBaseDiff + arrearOverage;

	// 1. Preview upgrade mid-cycle
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify invoices: pro ($20) + upgrade (prorated base + full arrear)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});
