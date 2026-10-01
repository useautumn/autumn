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
// TEST 3: Premium with consumable overage, downgrade to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable messages (100 included, $0.10/unit overage)
 * - Track 200 messages (100 overage = $10)
 * - Downgrade to pro ($20/mo)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage billed to Premium ($10)
 * - Pro active with balance reset
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 3: premium with consumable overage, downgrade to pro")}`,
	async () => {
		const customerId = "sched-switch-premium-cons-to-pro";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const premium = products.premium({
			id: "premium",
			items: [consumableItem],
		});

		const proConsumable = items.consumableMessages({ includedUsage: 50 });
		const pro = products.pro({
			id: "pro",
			items: [proConsumable],
		});

		const usageAmount = 200; // 100 overage

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, timeout: 5000 }),
				s.track({
					featureId: TestFeature.Messages,
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
			usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
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

		// Features at pro tier (50 included), balance reset
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});

		// Invoices:
		// 1. Premium ($50) + overage at cycle end ($10) = $60
		// 2. Pro renewal ($20)
		// Note: The exact invoice structure depends on implementation
		// The overage line lands via the cycle-end invoice webhook, so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 20 + expectedOverage, // Pro renewal + premium overage
			latestInvoiceProductIds: [pro.id, premium.id],
		});
	},
);
