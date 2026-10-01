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
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// TEST 1: Add-on with new_billing_subscription creates separate subscription
// =============================================================================

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Attach recurring add-on ($20/mo) with new_billing_subscription: true
 *
 * Expected:
 * - 2 Stripe subscriptions (pro + add-on on separate sub)
 * - Both products active
 * - 2 invoices ($20 each)
 * - Preview shows $20 (full price, no proration against existing sub)
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 1: addon creates separate subscription")}`,
	async () => {
		const customerId = "new-billing-sub-v2-addon";

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
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview: add-on should be full price ($20), not prorated against pro's sub
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
		});
		expect(preview.total).toBe(20);

		// Attach add-on with separate subscription
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: addon.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		// 2 separate subscriptions
		await expectSubCount({ ctx, customerId, count: 2 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, addon.id],
		});

		// 2 invoices: $20 for pro, $20 for add-on
		expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});
	},
);
