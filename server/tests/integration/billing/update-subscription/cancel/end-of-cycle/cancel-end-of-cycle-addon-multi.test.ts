// Cancel end-of-cycle add-on tests: add-on cancellation, subscription handling, and interaction with
// main products.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel add-on with separate subscription (new_billing_subscription)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/mo)
 * - Recurring add-on product ($20/mo) attached with new_billing_subscription: true
 * - User cancels Add-on at end of cycle
 *
 * Expected Result:
 * - Two separate Stripe subscriptions exist initially
 * - After cancel EOC, only the add-on's subscription should be marked as canceling
 * - Pro's subscription should NOT be affected
 * - After advancing to next invoice:
 *   - Pro is still active with its subscription
 *   - Add-on is removed
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: separate subscription (new_billing_subscription), correct sub canceled")}`,
	async () => {
		const customerId = "cancel-addon-eoc-separate-sub";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		// Get both subscription IDs (customerId is used as product prefix by default)
		const proSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		const addonSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: addon.id,
		});

		// Verify they are different subscriptions
		expect(proSubId).not.toBe(addonSubId);

		// Verify both subscriptions are active (not canceling)
		const proSubBefore = await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubBefore =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		expect(isStripeSubscriptionCanceling(proSubBefore)).toBe(false);
		expect(isStripeSubscriptionCanceling(addonSubBefore)).toBe(false);

		// Cancel add-on at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify only the add-on subscription is canceling
		const proSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		// Pro subscription should NOT be canceling
		expect(isStripeSubscriptionCanceling(proSubAfterCancel)).toBe(false);

		// Add-on subscription SHOULD be canceling
		expect(isStripeSubscriptionCanceling(addonSubAfterCancel)).toBe(true);

		// Verify customer product states
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: addon.id,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify state after cycle
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Pro should still be active
		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		// Add-on should be removed
		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: addon.id,
		});

		// Pro subscription should still exist and be active
		const proSubAfterAdvance =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		expect(proSubAfterAdvance.status).toBe("active");
		expect(isStripeSubscriptionCanceling(proSubAfterAdvance)).toBe(false);

		// Should have 1 subscription remaining (pro)
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple add-ons - cancel one EOC, other persists
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/mo)
 * - Add-on 1 ($20/mo)
 * - Add-on 2 ($20/mo)
 * - User attaches Pro, Add-on 1, and Add-on 2
 * - User cancels Add-on 1 at end of cycle
 *
 * Expected Result:
 * - Pro and Add-on 2 remain active
 * - Add-on 1 is canceling
 * - After advancing to next invoice:
 *   - Pro and Add-on 2 are still active
 *   - Add-on 1 is removed
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: multiple addons, cancel one, other persists")}`,
	async () => {
		const customerId = "cancel-addon-eoc-multiple";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon1 = products.recurringAddOn({
			id: "addon1",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const addon2 = products.recurringAddOn({
			id: "addon2",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon1, addon2] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon1.id }),
				s.attach({ productId: addon2.id }),
			],
		});

		// Verify all products are active
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});
		await expectProductActive({
			customer: customerAfterAttach,
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterAttach,
			productId: addon2.id,
		});

		// Verify invoices: pro ($20) + addon1 ($20) + addon2 ($20)
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 3,
			latestTotal: 20,
		});

		// Cancel add-on 1 at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon1.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify state after cancel
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterCancel,
			productId: addon2.id,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify state after cycle
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: addon1.id,
		});
		await expectProductActive({
			customer: customerAfterAdvance,
			productId: addon2.id,
		});
	},
);
