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
// TEST 2: Pro with consumable, into overage, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 150 messages (50 overage)
 * - Downgrade to free
 * - Advance to cycle end
 *
 * Expected Result:
 * - Overage charged at cycle end when downgrade completes ($5.00)
 * - After cycle: free active, overage billed to pro invoice
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 2: pro with consumable, into overage, to free")}`,
	async () => {
		const customerId = "sched-switch-cons-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const usageAmount = 150; // 50 overage

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: usageAmount,
					timeout: 2000,
				}),
				s.billing.attach({ productId: free.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// Calculate expected overage: 50 units * $0.10 = $5.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(5);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// After cycle: free active, pro removed
		await expectCustomerProducts({
			customer,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Features at free tier (50 included)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});

		// Pro invoice ($20) + overage ($5) = $25
		// Note: The overage is typically added to the final invoice, which lands
		// via the cycle-end invoice webhook — so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductIds: [pro.id],
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
