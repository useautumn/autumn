/**
 * Scheduled Switch Consumable Tests (Attach V2) — slice 1 of 2
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
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
// TEST 1: Pro with consumable, usage under limit, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50 messages (under included usage)
 * - Downgrade to free
 * - Advance to cycle end
 *
 * Expected Result:
 * - Scheduled downgrade with no overage charged at cycle end
 * - After cycle: pro removed, free active
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 1a: pro with consumable, usage under limit, to free (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-cons-under-limit-a";

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

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach webhooks first, then track: an invalidation landing inside the
		// track→sync window would revert the balance to 100.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50, // Under included
		});

		// Verify Stripe subscription after initial attach
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify balance before downgrade (100 included - 50 used = 50)
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 50,
		});

		// Downgrade to free
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify states
		await expectProductCanceling({
			customer: customerMidCycle,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerMidCycle,
			productId: free.id,
		});

		// Verify Stripe subscription after scheduling downgrade
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 1b: pro with consumable, usage under limit, to free (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-cons-under-limit-b";

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

		const {
			autumnV1: autumnV1After,
			ctx: ctxAfter,
			testClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Sequence the attach's webhooks BEFORE the track: one landing inside the
		// track→sync window deletes the cached balance and the deduction is dropped
		// on the floor (see quiesceCustomerWebhooks).
		await quiesceCustomerWebhooks({
			stripeCli: ctxAfter.stripeCli,
			autumn: autumnV1After,
			customerId,
		});

		await autumnV1After.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		// The downgrade attach invalidates the balance cache, which can drop a
		// deduction that has not reached Postgres yet — and cycle-end billing
		// reads Postgres. Gate on durability before scheduling the downgrade.
		await waitForCustomerUsageInDb({
			autumn: autumnV1After,
			customerId,
			featureId: TestFeature.Messages,
			usage: 50,
		});

		await autumnV1After.billing.attach({
			customer_id: customerId,
			product_id: free.id,
		}); // Schedule downgrade

		await advanceToNextInvoice({
			stripeCli: ctxAfter.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
			autumn: autumnV1After,
			customerId,
		});

		// After cycle: free active, pro removed. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Features at free tier (50 included)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});

		// Only pro invoice ($20), no overage since usage was under included.
		// The cycle-end invoice lands via webhook, so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: 0,
			latestInvoiceProductIds: [pro.id],
		});

		// After downgrading to free, there should be no Stripe subscription
		await expectEventually(() =>
			expectNoStripeSubscription({
				db: ctxAfter.db,
				customerId,
				org: ctxAfter.org,
				env: ctxAfter.env,
			}),
		);
	},
);

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

		const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach webhooks first, then track: an invalidation landing inside the
		// track→sync window drops the deduction outright.
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

		// Calculate expected overage: 50 units * $0.10 = $5.00
		const expectedOverage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: usageAmount }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(expectedOverage).toBe(5);

		// After cycle: free active, pro removed. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Features at free tier (50 included)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: expectedOverage,
			latestInvoiceProductIds: [pro.id],
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
