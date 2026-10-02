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
