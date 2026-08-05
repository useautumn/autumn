/**
 * Legacy Upgrade Tests - Prepaid Billing (slice 1 of 2)
 *
 * Migrated from:
 * - server/tests/attach/upgrade/upgrade4.test.ts (Prepaid seats: Pro → Premium → Pro Annual)
 * - server/tests/attach/upgrade/upgrade5.test.ts (Prepaid messages: Pro → Premium)
 *
 * Tests V1 attach behavior for product upgrades with prepaid billing:
 * - Prepaid seats (continuous use) with quantity options
 * - Prepaid messages (single use) with quantity options
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid seats (continuous use) - Pro → Premium → Pro Annual
// (from upgrade4)
//
// Scenario:
// - Pro ($20/month) with prepaid Users ($10/user, billingUnits: 1)
// - Premium ($50/month) with prepaid Users ($10/user, billingUnits: 1)
// - Pro annual ($200/year) with prepaid Users ($10/user, billingUnits: 1)
// - Attach Pro with 4 users (4 × $10 = $40)
// - Upgrade to Premium with 6 users (6 × $10 = $60)
// - Upgrade to Pro Annual with 3 users (3 × $10 = $30)
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price + prepaid seat charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-prepaid 1: prepaid seats Pro → Premium → Pro Annual")}`,
	async () => {
		const customerId = "legacy-upgrade-prepaid-1";

		// Prepaid users: $10/user (default), billingUnits: 1
		const proUsers = items.prepaidUsers({ includedUsage: 0, billingUnits: 1 });
		const premiumUsers = items.prepaidUsers({
			includedUsage: 0,
			billingUnits: 1,
		});
		const proAnnualUsers = items.prepaidUsers({
			includedUsage: 0,
			billingUnits: 1,
		});

		const pro = products.pro({ id: "pro", items: [proUsers] });
		const premium = products.premium({ id: "premium", items: [premiumUsers] });
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [proAnnualUsers],
		});

		// Setup: Create customer and products
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium, proAnnual] }),
			],
			actions: [],
		});

		// Attach Pro with 4 users
		// Invoice: Pro base ($20) + 4 users × $10 = $60
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Users, quantity: 4 }],
		});

		const customerInitial =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerInitial,
			active: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer: customerInitial,
			featureId: TestFeature.Users,
			includedUsage: 4,
			balance: 4, // 4 prepaid users
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerInitial,
			count: 1,
			latestTotal: 60, // Pro $20 + 4 × $10 = $60
		});

		// Upgrade to Premium with 6 users
		// New total: Premium base ($50) + 6 users × $10 = $110
		// Diff from previous: need to calculate based on proration
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Users, quantity: 6 }],
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
			includedUsage: 6,
			balance: 6, // 6 prepaid users
			usage: 0,
		});

		// Verify invoice count increased
		await expectCustomerInvoiceCorrect({
			customer: customerAfterPremium,
			count: 2,
		});

		// Upgrade to Pro Annual with 3 users
		// New total: Pro Annual base ($200) + 3 users × $10 = $230
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			options: [{ feature_id: TestFeature.Users, quantity: 3 }],
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
			includedUsage: 3,
			balance: 3, // 3 prepaid users
			usage: 0,
		});

		// Verify invoice count increased
		await expectCustomerInvoiceCorrect({
			customer: customerAfterProAnnual,
			count: 3,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid messages (single use) - Pro → Premium
// (from upgrade5)
//
// Scenario:
// - Pro ($20/month) with prepaid Messages ($10/100 units, billingUnits: 100)
// - Premium ($50/month) with prepaid Messages ($10/100 units, billingUnits: 100)
// - Attach Pro with 300 messages (3 packs × $10 = $30)
// - Track some usage
// - Upgrade to Premium with 600 messages (6 packs × $10 = $60)
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price + prepaid message packs
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-prepaid 2: prepaid messages Pro → Premium")}`,
	async () => {
		const customerId = "legacy-upgrade-prepaid-2";

		// Prepaid messages: $10/100 units (default)
		const proMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
		});
		const premiumMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
		});

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		// Setup: Create customer and products
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		// Attach Pro with 300 messages (3 packs)
		// Invoice: Pro base ($20) + 3 packs × $10 = $50
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});

		const customerInitial =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerInitial,
			active: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer: customerInitial,
			featureId: TestFeature.Messages,
			includedUsage: 300,
			balance: 300, // 300 prepaid messages
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerInitial,
			count: 1,
			latestTotal: 50, // Pro $20 + 3 × $10 = $50
		});

		// Track 100 messages usage
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Verify state before upgrade
		const customerBeforeUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer: customerBeforeUpgrade,
			featureId: TestFeature.Messages,
			includedUsage: 300,
			balance: 200, // 300 - 100 = 200
			usage: 100,
		});

		// Upgrade to Premium with 600 messages (6 packs)
		// New prepaid: 6 packs × $10 = $60
		// Old prepaid refund: 3 packs × $10 = $30
		// Base price diff: $50 - $20 = $30
		// Expected invoice: $30 (base diff) + $60 (new prepaid) - $30 (refund) = $60
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 600 }],
		});

		const customerAfterPremium =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPremium,
			active: [premium.id],
		});

		// Balance should be new prepaid quantity (usage does not carry over for prepaid)
		expectCustomerFeatureCorrect({
			customer: customerAfterPremium,
			featureId: TestFeature.Messages,
			includedUsage: 600,
			balance: 600, // 600 new prepaid messages
			usage: 0,
		});

		// Verify invoice count increased
		await expectCustomerInvoiceCorrect({
			customer: customerAfterPremium,
			count: 2,
		});
	},
);
