/**
 * Legacy Upgrade Tests - Usage-based Billing
 *
 * Migrated from:
 * - server/tests/attach/upgrade/upgrade1.test.ts (Pro → Premium → Growth with consumable Words)
 * - server/tests/attach/upgrade/upgrade2.test.ts (Pro monthly → Pro annual → Premium annual)
 * - server/tests/attach/upgrade/upgrade3.test.ts (Arrear prorated seats with entities)
 *
 * Tests V1 attach behavior for product upgrades with usage-based billing:
 * - Consumable (arrear) billing upgrades
 * - Monthly to annual interval changes
 * - Arrear prorated seat-based billing with entities
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with consumable (arrear) billing - Pro → Premium → Growth
// (from upgrade1)
//
// Scenario:
// - Pro ($20/month) with consumable Words (100 included, $0.05/overage)
// - Premium ($50/month) with consumable Words (100 included)
// - Growth ($100/month) with consumable Words (100 included)
// - Attach Pro, track 200 words (100 overage = $5), upgrade to Premium
// - Track 300 words (200 overage = $10), upgrade to Growth
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price diff + overage charges
// - Usage resets after each upgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth")}`, async () => {
	const customerId = "legacy-upgrade-usage-1";

	// Consumable words: 100 included, $0.05/overage
	const proWords = items.consumableWords({ includedUsage: 100 });
	const premiumWords = items.consumableWords({ includedUsage: 100 });
	const growthWords = items.consumableWords({ includedUsage: 100 });

	const pro = products.pro({ id: "pro", items: [proWords] });
	const premium = products.premium({ id: "premium", items: [premiumWords] });
	const growth = products.growth({ id: "growth", items: [growthWords] });

	// Setup: Create customer and products, attach Pro
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium, growth] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify initial state after Pro attach
	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 20, // Pro base price
	});

	// Track 200 words (100 overage at $0.05 = $5)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 200,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before upgrade (in overage)
	const customerBeforePremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforePremium,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -100, // 100 - 200 = -100 (overage)
		usage: 200,
	});

	// Upgrade to Premium
	// Expected: $50 - $20 = $30 price diff + $5 overage = $35
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	// Usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 35, // $30 price diff + $5 overage
	});

	// Track 300 words (200 overage at $0.05 = $10)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 300,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before Growth upgrade (in overage)
	const customerBeforeGrowth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforeGrowth,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -200, // 100 - 300 = -200 (overage)
		usage: 300,
	});

	// Upgrade to Growth
	// Expected: $100 - $50 = $50 price diff + $10 overage = $60
	await autumnV1.attach({
		customer_id: customerId,
		product_id: growth.id,
	});

	const customerAfterGrowth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterGrowth,
		active: [growth.id],
	});

	// Usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer: customerAfterGrowth,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterGrowth,
		count: 3,
		latestTotal: 60, // $50 price diff + $10 overage
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade with interval change - Monthly → Annual
// (from upgrade2)
//
// Scenario:
// - Pro monthly ($20/month) with consumable Words (100 included, $0.05/overage)
// - Pro annual ($200/year) with consumable Words (100 included)
// - Premium annual ($500/year) with consumable Words (100 included)
// - Attach Pro monthly, track 150 words (50 overage = $2.50), advance 2 weeks
// - Upgrade to Pro annual
// - Track 200 words (100 overage = $5), upgrade to Premium annual
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Interval changes correctly from monthly to annual
// - Invoice totals include prorated price diff + overage charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 2: monthly → annual interval change")}`, async () => {
	const customerId = "legacy-upgrade-usage-2";

	const proMonthlyWords = items.consumableWords({ includedUsage: 100 });
	const proAnnualWords = items.consumableWords({ includedUsage: 100 });
	const premiumAnnualWords = items.consumableWords({ includedUsage: 100 });

	const proMonthly = products.pro({
		id: "pro-monthly",
		items: [proMonthlyWords],
	});
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualWords],
	});
	const premiumAnnual = constructProduct({
		id: "premium-annual",
		items: [premiumAnnualWords],
		type: "premium",
		isAnnual: true,
	});

	// Setup: Create customer and products, attach Pro monthly
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proMonthly, proAnnual, premiumAnnual] }),
		],
		actions: [s.attach({ productId: proMonthly.id })],
	});

	// Verify initial state after Pro monthly attach
	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [proMonthly.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 20, // Pro monthly base price
	});

	// Track 150 words (50 overage at $0.05 = $2.50)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 150,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before Pro Annual upgrade
	const customerBeforeProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforeProAnnual,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50 (overage)
		usage: 150,
	});

	// Upgrade to Pro Annual
	// Price diff: $200 - $20 = $180 (but prorated based on remaining cycle)
	// Overage: 50 × $0.05 = $2.50
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	// Usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer: customerAfterProAnnual,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice count increased (exact total depends on proration)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 2,
	});

	// Track 200 words (100 overage at $0.05 = $5)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 200,
	});

	await new Promise((r) => setTimeout(r, 2000));

	// Verify state before Premium Annual upgrade
	const customerBeforePremiumAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBeforePremiumAnnual,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: -100, // 100 - 200 = -100 (overage)
		usage: 200,
	});

	// Upgrade to Premium Annual
	// Price diff: $500 - $200 = $300 (but prorated)
	// Overage: 100 × $0.05 = $5
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumAnnual.id,
	});

	const customerAfterPremiumAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremiumAnnual,
		active: [premiumAnnual.id],
	});

	// Usage resets after upgrade
	expectCustomerFeatureCorrect({
		customer: customerAfterPremiumAnnual,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremiumAnnual,
		count: 3,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade with arrear prorated seats (entities)
// (from upgrade3)
//
// Scenario:
// - Pro ($20/month) with allocated Users ($10/user prorated, 0 included)
// - Premium ($50/month) with allocated Users ($10/user prorated, 0 included)
// - Pro annual ($200/year) with allocated Users ($10/user prorated, 0 included)
// - Create 2 entities, attach Pro (2 users × $10 = $20 seat charge)
// - Advance 1 week, create 3rd entity, upgrade to Premium
// - Upgrade to Pro Annual
//
// Expected:
// - Customer has correct product and usage after each upgrade
// - Entity count (usage) is tracked correctly
// - Invoice totals reflect seat charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade-usage 3: arrear prorated seats with entities")}`, async () => {
	const customerId = "legacy-upgrade-usage-3";

	// Allocated users: $10/user prorated, 0 included
	const proUsers = items.allocatedUsers({ includedUsage: 0 });
	const premiumUsers = items.allocatedUsers({ includedUsage: 0 });
	const proAnnualUsers = items.allocatedUsers({ includedUsage: 0 });

	const pro = products.pro({ id: "pro", items: [proUsers] });
	const premium = products.premium({ id: "premium", items: [premiumUsers] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [proAnnualUsers],
	});

	// Setup: Create customer, products, and 2 entities, attach Pro
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium, proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify initial state - Pro with 2 users
	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerInitial,
		active: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerInitial,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 2,
		balance: -2, // 0 included - 2 usage = -2
	});

	// Invoice: Pro base ($20) + 2 users × $10 = $40
	await expectCustomerInvoiceCorrect({
		customer: customerInitial,
		count: 1,
		latestTotal: 40,
	});

	// Create 3rd entity
	await autumnV1.entities.create(customerId, [
		{ id: "ent-3", name: "Entity 3", feature_id: TestFeature.Users },
	]);

	await new Promise((r) => setTimeout(r, 3000));

	// Verify state before Premium upgrade - now 3 users
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3, // 0 included - 3 usage = -3
	});

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 10,
	});

	// Upgrade to Premium
	// Base price diff: $50 - $20 = $30
	// Seat charge diff: 3 users × ($10 premium - $10 pro) = $0 (same rate)
	// Plus prorated charge for the new seat
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 3,
		latestTotal: 30,
	});

	// Upgrade to Pro Annual
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const customerAfterProAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterProAnnual,
		active: [proAnnual.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterProAnnual,
		featureId: TestFeature.Users,
		includedUsage: 0,
		usage: 3,
		balance: -3,
	});

	// Verify invoice count increased
	await expectCustomerInvoiceCorrect({
		customer: customerAfterProAnnual,
		count: 4,
		latestTotal: 150,
	});
});
