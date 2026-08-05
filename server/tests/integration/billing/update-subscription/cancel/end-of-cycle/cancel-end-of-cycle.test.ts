/**
 * Cancel End of Cycle Tests
 *
 * Slice 1 of 2: default free product + downgrade then cancel.
 *
 * Tests for the `cancel: 'end_of_cycle'` parameter in update subscription.
 * This cancels a subscription at the end of the current billing period.
 *
 * Key behaviors:
 * - Product remains active until cycle end
 * - Default product (if exists) is scheduled to start at cycle end
 * - Stripe subscription is set to cancel at period end
 * - After cycle end, product is removed and default (if any) becomes active
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel end of cycle with default free product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro (paid product, $20/mo)
 * - Free default product exists
 * - User cancels Pro at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling (active with canceled_at set)
 * - Free default should be scheduled
 * - Stripe subscription should be set to cancel at period end
 * - After advancing to next invoice, Pro is gone and Free is active
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle: with default free product")}`,
	async () => {
		const customerId = "cancel-eoc-with-default";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		// Free is the default product (products.base has no base price = free)
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Verify pro is active
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		// Cancel pro at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify pro is canceling and free is scheduled (scheduling settles via webhook)
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			canceling: [pro.id],
			scheduled: [free.id],
		});

		// Verify Stripe subscription is set to cancel at period end
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});

		// Initial attach invoice
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 20, // Pro $20/mo
		});

		// Advance to next invoice (next billing cycle)
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// After advancing, pro should be gone and free should be active
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Verify no Stripe subscription exists after cycle end (free has no price)
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade then cancel end of cycle (with default)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium ($50/mo)
 * - User downgrades to Pro ($20/mo) → Premium is canceling, Pro is scheduled
 * - User cancels Premium at end of cycle
 *
 * Expected Result:
 * - Premium is still canceling
 * - Pro scheduled product should be REMOVED
 * - Free default should be scheduled instead
 * - Stripe subscription is set to cancel at period end
 *
 * This tests the case where cancel_end_of_cycle deletes an existing scheduled product.
 *
 * Reference: cancel6.test.ts (migrated)
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle: downgrade then cancel (with default)")}`,
	async () => {
		const customerId = "cancel-eoc-downgrade-default";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		// Free is the default product (products.base has no base price = free)
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		// Pro product ($20/mo)
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		// Premium product ($50/mo) - use products.base with custom price
		const premiumPriceItem = items.monthlyPrice({ price: 50 });
		const premium = products.base({
			id: "premium",
			items: [messagesItem, premiumPriceItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.attach({ productId: pro.id }), // Downgrade: premium canceling, pro scheduled
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeCustomerId = customer.stripe_id;
		const subs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId!,
		});
		expect(subs.data.length).toBe(1);

		const sub = subs.data[0];

		// When a subscription is managed by a schedule, the schedule handles cancellation
		// The subscription itself should NOT have cancel_at set (schedule manages lifecycle)
		expect(sub.schedule).not.toBeNull();

		// Cancel premium at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: premium.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify state after cancel (swapping the scheduled product settles via webhook)
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			canceling: [premium.id],
			notPresent: [pro.id],
			scheduled: [free.id],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [premium.id],
		});
	},
);
