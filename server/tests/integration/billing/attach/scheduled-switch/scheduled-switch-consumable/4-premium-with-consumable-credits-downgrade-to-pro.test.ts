/**
 * Scheduled Switch Consumable Tests (Attach V2)
 *
 * Tests for downgrades involving consumable (usage-in-arrear) features.
 *
 * Key behaviors:
 * - Consumable overage is charged at cycle end via invoice-created webhook
 * - These tests verify the downgrade flow works correctly with consumable usage
 * - Overage from the old product is billed when downgrade completes
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium with consumable credits, downgrade to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable credits (200 included, $0.10/unit overage)
 * - Track 300 credits (100 overage = $10)
 * - Downgrade to pro ($20/mo) with consumable credits (100 included)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged on premium ($10) at cycle end
 * - Pro active with usage reset to 0 and balance at 100 (pro's included)
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 4: premium with consumable credits, downgrade to pro")}`,
	async () => {
		const customerId = "sched-switch-premium-credits-to-pro";

		const premiumConsumableCredits = items.consumable({
			featureId: TestFeature.Credits,
			includedUsage: 200,
			price: 0.1,
			billingUnits: 1,
		});

		const premium = products.premium({
			id: "premium",
			items: [premiumConsumableCredits],
		});

		const proConsumableCredits = items.consumable({
			featureId: TestFeature.Credits,
			includedUsage: 100,
			price: 0.1,
			billingUnits: 1,
		});

		const pro = products.pro({
			id: "pro",
			items: [proConsumableCredits],
		});

		const usageAmount = 300; // 100 overage (300 - 200 included)

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, timeout: 5000 }),
				s.track({
					featureId: TestFeature.Credits,
					value: usageAmount,
					timeout: 2000,
				}),
				s.billing.attach({ productId: pro.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// Verify Stripe subscription after all operations
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Calculate expected overage: 100 units * $0.10 = $10.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// After cycle: pro active, premium removed
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [premium.id],
		});

		// Features at pro tier (100 included), usage reset to 0
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Credits,
			balance: 100,
			usage: 0,
		});

		// Invoices:
		// 1. Premium ($50) initial
		// 2. Pro renewal ($20) + premium overage ($10) = $30
		// The overage line lands via the cycle-end invoice webhook, so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductIds: [pro.id, premium.id],
		});
	},
);
