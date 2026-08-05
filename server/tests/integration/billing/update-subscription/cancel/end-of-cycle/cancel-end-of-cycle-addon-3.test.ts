/**
 * Cancel End-of-Cycle Add-On Tests
 *
 * Slice 3 of 3: multiple add-ons, cancel one.
 *
 * Tests for canceling add-on products at end of billing cycle.
 * Verifies add-on cancellation behavior, subscription handling,
 * and interaction with main products.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
