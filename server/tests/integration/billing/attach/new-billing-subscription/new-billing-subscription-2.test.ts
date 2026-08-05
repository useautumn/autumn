/**
 * New Billing Subscription Tests (V2 Attach) — slice 2 of 2
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
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
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

// =============================================================================
// TEST 6: Customer upgrade doesn't affect entity's separate subscription
// =============================================================================

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Entity 1 on Premium ($50/mo) on separate sub via new_billing_subscription
 * - Upgrade customer from Pro to Premium
 *
 * Expected:
 * - Still 2 subs (customer premium + entity premium on separate sub)
 * - Customer has premium active, pro gone
 * - Entity still has premium on its independent sub
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 6: customer upgrade doesn't affect entity separate sub")}`,
	async () => {
		const customerId = "new-billing-sub-v2-upgrade-entity-intact";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					newBillingSubscription: true,
				}),
			],
		});

		// Initial: 2 subs (customer pro + entity premium)
		await expectSubCount({ ctx, customerId, count: 2 });

		// Upgrade customer from pro to premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		// Still 2 subs (customer premium replaced pro on same sub, entity premium untouched)
		await expectSubCount({ ctx, customerId, count: 2 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Customer: premium active, pro gone
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// Entity: premium still active on its separate sub
		const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
		await expectProductActive({
			customer: entityAfter,
			productId: premium.id,
		});
	},
);

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

// =============================================================================
// TEST 8: Free -> paid main with existing paid cycle merges when requested
// =============================================================================

/**
 * Scenario:
 * - Customer has free main product
 * - Customer has paid recurring add-on (existing paid cycle)
 * - Attach paid main product with new_billing_subscription: false (explicit merge)
 *
 * Expected:
 * - Stays on one subscription (merge into existing paid cycle)
 * - Free main is replaced
 * - Paid add-on remains active
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 8: free to paid main merges into existing paid cycle")}`,
	async () => {
		const customerId = "new-billing-sub-v2-free-to-paid-main-merge";

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
			new_billing_subscription: false,
			redirect_mode: "if_required",
		});

		await expectSubCount({ ctx, customerId, count: 1 });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id, addon.id],
			notPresent: [free.id],
		});
	},
);
