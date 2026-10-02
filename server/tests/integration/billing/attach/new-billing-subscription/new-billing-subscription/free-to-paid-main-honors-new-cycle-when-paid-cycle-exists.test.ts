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

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// TEST 7: Free -> paid main with existing paid cycle honors new_billing_subscription
// =============================================================================

/**
 * Scenario:
 * - Customer has free main product
 * - Customer has paid recurring add-on (existing paid cycle)
 * - Attach paid main product with new_billing_subscription: true
 *
 * Expected:
 * - Creates a separate subscription for the paid main product
 * - Free main is replaced
 * - Paid add-on remains active
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 7: free to paid main honors new cycle when paid cycle exists")}`,
	async () => {
		const customerId = "new-billing-sub-v2-free-to-paid-main-new-cycle";

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, addon, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: addon.id }),
			],
		});

		await expectSubCount({ ctx, customerId, count: 1 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 2 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id, addon.id],
			notPresent: [free.id],
		});
	},
);
