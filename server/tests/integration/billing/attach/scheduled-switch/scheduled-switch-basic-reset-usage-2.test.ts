/**
 * Scheduled Switch Basic — reset_usage_when_enabled: false (Attach V2), slice 2
 *
 * Split out of scheduled-switch-basic-reset-usage.test.ts.
 *
 * Key behavior under test: `reset_usage_when_enabled: false` only affects
 * IMMEDIATE switches. A SCHEDULED switch always resets usage at the cycle
 * boundary, regardless of the flag.
 *
 * Each scenario is split into an "a" (mid-cycle) and "b" (after cycle) test with
 * separate customers so each test owns its own Stripe test clock.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectEventually } from "./utils/expectEventually";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Pro to Free with reset_usage_when_enabled: false
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with 500 messages, reset_usage_when_enabled: false
 * - Track 200 messages
 * - Downgrade to Free with 100 messages, reset_usage_when_enabled: false
 * - Advance to next cycle
 *
 * Expected Result:
 * - Free active with messages usage RESET to 0
 * - Balance = 100 (scheduled switches always reset usage)
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 6a: pro to free (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-pro-to-free-a";

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const freeMessagesItem = items.monthlyMessages({
			includedUsage: 100,
			resetUsageWhenEnabled: false,
		});
		const free = products.base({
			id: "free",
			items: [freeMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
			],
		});

		// Verify usage tracked on pro
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 300, // 500 - 200
			usage: 200,
		});

		// Schedule downgrade to free
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		// Verify scheduled states
		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerMidCycle,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerMidCycle,
			productId: free.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 6b: pro to free (usage resets after cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-pro-to-free-b";

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const freeMessagesItem = items.monthlyMessages({
			includedUsage: 100,
			resetUsageWhenEnabled: false,
		});
		const free = products.base({
			id: "free",
			items: [freeMessagesItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// Verify products after cycle. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Verify usage RESET (scheduled switches always reset)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100, // RESET
			usage: 0, // RESET
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
