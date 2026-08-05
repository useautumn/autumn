/**
 * Scheduled Switch Basic — reset_usage_when_enabled: false (Attach V2)
 *
 * Split out of scheduled-switch-basic.test.ts.
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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectEventually } from "./utils/expectEventually";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium to Pro with reset_usage_when_enabled: false
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with 1000 messages, reset_usage_when_enabled: false
 * - Track 300 messages
 * - Downgrade to Pro ($20/mo) with 500 messages, reset_usage_when_enabled: false
 * - Advance to next cycle
 *
 * Expected Result:
 * - Pro active with messages usage RESET to 0
 * - Balance = 500 (reset_usage_when_enabled only affects IMMEDIATE switches, not scheduled)
 * - Scheduled product switches ALWAYS reset usage regardless of reset_usage_when_enabled setting
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 5a: premium to pro with reset_usage_when_enabled: false (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-premium-to-pro-a";

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 1000,
			resetUsageWhenEnabled: false,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.track({ featureId: TestFeature.Messages, value: 300, timeout: 4000 }),
			],
		});

		// Verify usage tracked on premium
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 700, // 1000 - 300
			usage: 300,
		});

		// Schedule downgrade to pro
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// Verify scheduled states
		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerMidCycle,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: customerMidCycle,
			productId: pro.id,
		});

		// Usage still shows on canceling product
		expectCustomerFeatureCorrect({
			customer: customerMidCycle,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 700,
			usage: 300,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 5b: premium to pro with reset_usage_when_enabled: false (usage resets after cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-premium-to-pro-b";

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 1000,
			resetUsageWhenEnabled: false,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
				s.billing.attach({ productId: pro.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		// Verify products after cycle. Webhook-driven, so poll.
		await expectCustomerProducts({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [premium.id],
		});

		// Verify usage RESET (scheduled switches always reset, regardless of reset_usage_when_enabled)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1After,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500, // RESET - not 500 - 300 = 200
			usage: 0, // RESET
		});

		// Verify Stripe subscription
		await expectEventually(() =>
			expectSubToBeCorrect({
				db: ctxAfter.db,
				customerId,
				org: ctxAfter.org,
				env: ctxAfter.env,
			}),
		);
	},
);

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
