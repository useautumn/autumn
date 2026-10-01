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
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// TEST 5: Downgrade ignores new_billing_subscription
// =============================================================================

/**
 * Scenario:
 * - Customer on Premium ($50/mo)
 * - Attach Pro ($20/mo) with new_billing_subscription: true
 *
 * Expected:
 * - Still 1 subscription (flag silently ignored for downgrades)
 * - Premium still active, Pro scheduled for end of cycle
 * - No new invoice created for the downgrade
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 5: downgrade ignores flag")}`,
	async () => {
		const customerId = "new-billing-sub-v2-downgrade-ignored";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		// Attach pro with new_billing_subscription (should be ignored for downgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		// Still 1 subscription — flag was ignored
		await expectSubCount({ ctx, customerId, count: 1 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Normal downgrade: premium canceling (end of cycle), pro scheduled
		await expectCustomerProducts({
			customer,
			canceling: [premium.id],
			scheduled: [pro.id],
		});

		// Only 1 invoice (initial premium), no new invoice for scheduled downgrade
		expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 50,
		});
	},
);
