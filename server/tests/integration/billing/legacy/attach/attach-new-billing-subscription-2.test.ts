/**
 * Attach New Billing Subscription Tests (Legacy Migration)
 *
 * Slice 2 of 2 (see attach-new-billing-subscription.test.ts for slice 1).
 *
 * Tests for the `new_billing_subscription` flag on attach, which creates
 * a separate Stripe subscription instead of merging into the existing one.
 *
 * Migrated from:
 * - server/tests/integration/billing/new-billing-subscription/new-billing-subscription1.test.ts
 *
 * Key behaviors tested:
 * - Entities with new_billing_subscription get separate subs
 * - Upgrading main customer doesn't affect entity's separate sub
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, CustomerExpand } from "@autumn/shared";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entities with new_billing_subscription (separate subs per entity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with pro attached (customer-level)
 * - 2 entities
 * - Attach premium to entity 1 with new_billing_subscription → 2 subs
 * - Attach premium to entity 2 with new_billing_subscription → 3 subs
 *
 * Expected:
 * - Each entity premium is on a separate sub
 * - Customer pro + entity 1 premium + entity 2 premium = 3 subs
 * - All products active
 */
test.concurrent(
	`${chalk.yellowBright("attach: entities with new_billing_subscription (separate subs)")}`,
	async () => {
		const customerId = "new-billing-sub-entities";

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
				s.attach({ productId: pro.id }),
				s.attach({
					productId: premium.id,
					entityIndex: 0,
					newBillingSubscription: true,
				}),
			],
		});

		// After entity 1 attach: 2 subs
		await expectSubCount({ ctx, customerId, count: 2 });

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		await expectProductActive({ customer: entity1, productId: premium.id });

		// Attach premium to entity 2 → 3 subs
		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entities[1].id,
			product_id: premium.id,
			new_billing_subscription: true,
		});

		await expectSubCount({ ctx, customerId, count: 3 });

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		await expectProductActive({ customer: entity2, productId: premium.id });

		// Verify final state: customer pro active, both entity premiums active
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			expand: [CustomerExpand.Invoices],
		});
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Customer upgrade doesn't affect entity's separate sub
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with pro + entity 1 with premium (on separate sub)
 * - Upgrade customer from pro to premium
 *
 * Expected:
 * - Customer pro is replaced by premium
 * - Entity 1 premium remains on its separate sub
 * - Still 2 subs total (not 3)
 */
test.concurrent(
	`${chalk.yellowBright("attach: customer upgrade doesn't affect entity separate sub")}`,
	async () => {
		const customerId = "new-billing-sub-upgrade";

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
				s.attach({ productId: pro.id }),
				s.attach({
					productId: premium.id,
					entityIndex: 0,
					newBillingSubscription: true,
				}),
			],
		});

		// Verify initial: customer pro + entity premium = 2 subs
		await expectSubCount({ ctx, customerId, count: 2 });

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer: customerBefore, productId: pro.id });

		const entityBefore = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entityBefore,
			productId: premium.id,
		});

		// Upgrade customer from pro → premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		// Customer should have premium active, pro gone
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// Still 2 subs (customer premium + entity premium on separate sub)
		await expectSubCount({ ctx, customerId, count: 2 });

		// Entity should still have premium active on its separate sub
		const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
		await expectProductActive({
			customer: entityAfter,
			productId: premium.id,
		});
		expect(entityAfter.products!.length).toBe(1);

		expect(customerAfter.invoices).toBeDefined();
		expect(customerAfter.invoices!.length).toBeGreaterThanOrEqual(1);
	},
);
