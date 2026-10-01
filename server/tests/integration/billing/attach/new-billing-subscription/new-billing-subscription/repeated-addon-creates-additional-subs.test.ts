/**
 * New Billing Subscription Tests (V2 Attach)
 *
 * Tests for the `new_billing_subscription` flag on the V2 attach endpoint,
 * which forces creation of a separate Stripe subscription instead of merging
 * into the existing one.
 *
 * Key behaviors tested:
 * - Add-on with new_billing_subscription creates separate sub
 * - Repeated add-on attachment creates additional subs
 * - Entities with new_billing_subscription get separate subs
 * - Upgrades/downgrades silently ignore the flag
 * - Customer upgrade doesn't affect entity's separate sub
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// TEST 2: Repeated add-on attachment creates additional subscriptions
// =============================================================================

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Attach recurring add-on with new_billing_subscription (2 subs)
 * - Attach same add-on again with new_billing_subscription (3 subs)
 *
 * Expected:
 * - 3 Stripe subscriptions total
 * - Add-on quantity = 2
 * - 3 invoices
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 2: repeated addon creates additional subs")}`,
	async () => {
		const customerId = "new-billing-sub-v2-repeat";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: addon.id,
					newBillingSubscription: true,
				}),
			],
		});

		// After first add-on: 2 subs
		await expectSubCount({ ctx, customerId, count: 2 });

		// Attach same add-on again
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		// 3 subs: pro + addon + addon
		await expectSubCount({ ctx, customerId, count: 3 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const addonProduct = customer.products.find((p) => p.id === addon.id);
		expect(addonProduct?.quantity).toBe(2);

		expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 20,
		});
	},
);
