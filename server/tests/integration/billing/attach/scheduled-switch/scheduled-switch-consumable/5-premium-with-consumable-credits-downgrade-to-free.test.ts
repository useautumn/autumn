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
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium with consumable credits, downgrade to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with consumable credits (200 included, $0.10/unit overage)
 * - Track 350 credits (150 overage = $15)
 * - Downgrade to free (50 monthly credits, no overage)
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged on premium ($15) at cycle end
 * - Free active with usage reset to 0 and balance at 50 (free's included)
 * - No Stripe subscription after downgrade to free
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 5: premium with consumable credits, downgrade to free")}`,
	async () => {
		const customerId = "sched-switch-premium-credits-to-free";

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

		const freeCredits = items.monthlyCredits({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeCredits],
		});

		const usageAmount = 350; // 150 overage (350 - 200 included)

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, free] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, timeout: 5000 }),
				s.track({
					featureId: TestFeature.Credits,
					value: usageAmount,
					timeout: 2000,
				}),
				s.billing.attach({ productId: free.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// Calculate expected overage: 150 units * $0.10 = $15.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(15);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// After cycle: free active, premium removed
		await expectCustomerProducts({
			customer,
			active: [free.id],
			notPresent: [premium.id],
		});

		// Features at free tier (50 included), usage reset to 0
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Credits,
			balance: 50,
			usage: 0,
		});

		// Invoices:
		// 1. Premium ($50) initial
		// 2. Premium overage ($15) at cycle end
		// The overage line lands via the cycle-end invoice webhook, so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductIds: [premium.id],
		});

		// After downgrading to free, there should be no Stripe subscription
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
