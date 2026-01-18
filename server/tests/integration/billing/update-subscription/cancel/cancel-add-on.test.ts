/**
 * Cancel Add-On Tests
 *
 * Tests for canceling products when add-ons are present.
 * Verifies that add-on products persist correctly when main products are canceled.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel pro product, add-on persists with free default scheduled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free default product exists
 * - Pro product ($20/mo)
 * - Recurring add-on product ($20/mo with 300 messages)
 * - User attaches Pro and Add-on
 * - User cancels Pro at end of cycle
 *
 * Expected Result:
 * - Pro should be canceling (active with canceled_at set)
 * - Free default should be scheduled
 * - Add-on should remain active (not affected by pro cancellation)
 * - After advancing to next invoice:
 *   - Pro is gone
 *   - Free is active
 *   - Add-on is still active
 */
test.concurrent(`${chalk.yellowBright("cancel add-on: cancel pro, add-on persists with free scheduled")}`, async () => {
	const customerId = "cancel-addon-pro-free-scheduled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product
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

	// Recurring add-on with its own price ($20/mo + 300 messages)
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	// Verify pro and add-on are active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await expectProductActive({
		customer: customerAfterAttach,
		productId: addon.id,
	});

	// Verify invoices: pro attach ($20) + add-on attach ($20)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
		latestTotal: 20, // Add-on invoice
	});

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "end_of_cycle",
	});

	// Verify state after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [pro.id],
		scheduled: [free.id],
		active: [addon.id],
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify state after cycle
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAdvance,
		notPresent: [pro.id],
		active: [free.id, addon.id],
	});

	// Subscription should exist for the add-on
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1, // Add-on subscription remains
	});
});
