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
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// TEST 3: Entity products with new_billing_subscription get separate subs
// =============================================================================

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Entity 1 attaches Premium ($50/mo) with new_billing_subscription (2 subs)
 * - Entity 2 attaches Premium ($50/mo) with new_billing_subscription (3 subs)
 *
 * Expected:
 * - 3 Stripe subscriptions (customer pro + entity1 premium + entity2 premium)
 * - All products active on their respective owners
 */
test.concurrent(
	`${chalk.yellowBright("new-billing-sub 3: entities get separate subs")}`,
	async () => {
		const customerId = "new-billing-sub-v2-entities";

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
				s.entities({ count: 2, featureId: TestFeature.Users }),
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

		// After entity 1 attach: 2 subs
		await expectSubCount({ ctx, customerId, count: 2 });

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		await expectProductActive({
			customer: entity1,
			productId: premium.id,
		});

		// Attach premium to entity 2 with separate sub
		await autumnV1.billing.attach({
			customer_id: customerId,
			entity_id: entities[1].id,
			product_id: premium.id,
			new_billing_subscription: true,
			redirect_mode: "if_required",
		});

		// 3 subs: customer pro + entity1 premium + entity2 premium
		await expectSubCount({ ctx, customerId, count: 3 });

		// Verify all products active on their owners
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });

		const entity1Final = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1Final,
			productId: premium.id,
		});

		const entity2Final = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Final,
			productId: premium.id,
		});
	},
);
