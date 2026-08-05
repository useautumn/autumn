/**
 * Legacy Upgrade Tests - Usage-based Billing (slice 2 of 2)
 *
 * Migrated from:
 * - server/tests/attach/upgrade/upgrade3.test.ts (Arrear prorated seats with entities)
 *
 * Tests V1 attach behavior for product upgrades with usage-based billing:
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

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-usage 3: arrear prorated seats with entities")}`,
	async () => {
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

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
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

		// The prorated seat invoice for the new entity is written asynchronously.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 10,
		});

		// Verify state before Premium upgrade - now 3 users
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Users,
			includedUsage: 0,
			usage: 3,
			balance: -3, // 0 included - 3 usage = -3
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

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
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

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
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
	},
);
