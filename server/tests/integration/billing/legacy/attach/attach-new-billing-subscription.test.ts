/**
 * Attach New Billing Subscription Tests (Legacy Migration)
 *
 * Slice 1 of 2 (see attach-new-billing-subscription-2.test.ts for slice 2).
 *
 * Tests for the `new_billing_subscription` flag on attach, which creates
 * a separate Stripe subscription instead of merging into the existing one.
 *
 * Migrated from:
 * - server/tests/integration/billing/new-billing-subscription/new-billing-subscription1.test.ts
 *
 * Key behaviors tested:
 * - Add-on with new_billing_subscription creates separate sub mid-cycle
 * - Attaching same add-on again creates a third sub
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Paid add-on with new_billing_subscription mid-cycle, then attach again
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro product to customer
 * - Advance clock 2 weeks (mid-cycle)
 * - Attach paid add-on with new_billing_subscription → creates 2nd sub
 * - Attach same add-on again with new_billing_subscription → creates 3rd sub
 *
 * Expected:
 * - After first add-on: 2 subs, 2 invoices, add-on product attached
 * - After second add-on: 3 subs, 3 invoices, add-on quantity = 2
 */
test.concurrent(
	`${chalk.yellowBright("attach: paid add-on with new_billing_subscription mid-cycle")}`,
	async () => {
		const customerId = "new-billing-sub-addon";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const addOn = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.advanceTestClock({ weeks: 2 }),
				s.attach({
					productId: addOn.id,
					newBillingSubscription: true,
				}),
			],
		});

		// After first add-on attach: 2 subs, both products active
		await expectSubCount({ ctx, customerId, count: 2 });

		const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customer1,
			active: [pro.id, addOn.id],
		});
		expectCustomerInvoiceCorrect({
			customer: customer1,
			count: 2,
			latestTotal: 20, // recurringAddOn uses type: "pro" → $20/month
		});

		// Attach same add-on again → 3 subs
		await autumnV1.attach({
			customer_id: customerId,
			product_id: addOn.id,
			new_billing_subscription: true,
		});

		await expectSubCount({ ctx, customerId, count: 3 });

		const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const addOnProduct = customer2.products.find((p) => p.id === addOn.id);
		expect(addOnProduct?.quantity).toBe(2);
		expectCustomerInvoiceCorrect({
			customer: customer2,
			count: 3,
			latestTotal: 20,
		});
	},
);
