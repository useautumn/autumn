/**
 * Scheduled Switch Consumable Tests (Attach V2) — slice 2 of 2
 *
 * Tests for downgrades involving consumable (usage-in-arrear) features.
 *
 * Key behaviors:
 * - Consumable overage is charged at cycle end via invoice-created webhook
 * - These tests verify the downgrade flow works correctly with consumable usage
 * - Overage from the old product is billed when downgrade completes
 */

import { expect, test } from "bun:test";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForCustomerUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectEventually } from "./utils/expectEventually";

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

		const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		// Attach webhooks first, then track — the fixed 5s `timeout` this used to
		// carry was a guess at the same hop, and lost the race in `bun tw`.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usageAmount,
		});

		// Cycle-end overage is computed from Postgres, so the deduction must be
		// durable before the downgrade attach invalidates the balance cache.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			usage: usageAmount,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		}); // Schedule downgrade

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify Stripe subscription after all operations
		await expectEventually(() =>
			expectSubToBeCorrect({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			}),
		);

		// Calculate expected overage: 100 units * $0.10 = $10.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(10);

		// After cycle: pro active, premium removed. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [premium.id],
		});

		// Features at pro tier (50 included), balance reset
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: 20 + expectedOverage, // Pro renewal + premium overage
			latestInvoiceProductIds: [pro.id, premium.id],
		});
	},
);

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

		const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		// Attach webhooks first, then track — the fixed 5s `timeout` this used to
		// carry was a guess at the same hop, and lost the race in `bun tw`.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: usageAmount,
		});

		// Cycle-end overage is computed from Postgres, so the deduction must be
		// durable before the downgrade attach invalidates the balance cache —
		// otherwise the renewal invoice comes back short by exactly the overage.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Credits,
			usage: usageAmount,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
		}); // Schedule downgrade

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify Stripe subscription after all operations
		await expectEventually(() =>
			expectSubToBeCorrect({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			}),
		);

		// Calculate expected overage: 100 units * $0.10 = $10.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(10);

		// After cycle: pro active, premium removed. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [premium.id],
		});

		// Features at pro tier (100 included), usage reset to 0
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: 20 + expectedOverage,
			latestInvoiceProductIds: [pro.id, premium.id],
		});
	},
);

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

		const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, free] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		// Attach webhooks first, then track — the fixed 5s `timeout` this used to
		// carry was a guess at the same hop, and lost the race in `bun tw`.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: usageAmount,
		});

		// Cycle-end overage is computed from Postgres, so the deduction must be
		// durable before the downgrade attach invalidates the balance cache.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Credits,
			usage: usageAmount,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
		}); // Schedule downgrade

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Calculate expected overage: 150 units * $0.10 = $15.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: premium.items,
			usage: [{ featureId: TestFeature.Credits, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(15);

		// After cycle: free active, premium removed. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [premium.id],
		});

		// Features at free tier (50 included), usage reset to 0
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductIds: [premium.id],
		});

		// After downgrading to free, there should be no Stripe subscription
		await expectEventually(() =>
			expectNoStripeSubscription({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			}),
		);
	},
);
