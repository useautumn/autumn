/**
 * Attach New Billing Subscription Tests (Legacy Migration)
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
 * - Entities with new_billing_subscription get separate subs
 * - Upgrading main customer doesn't affect entity's separate sub
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusExpand } from "@autumn/shared";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
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
test.concurrent(`${chalk.yellowBright("attach: paid add-on with new_billing_subscription mid-cycle")}`, async () => {
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

	// After first add-on attach: 2 subs
	await expectSubCount({ ctx, customerId, count: 2 });

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customer1, productId: addOn.id });
	expect(customer1.invoices.length).toBe(2);
	expect(customer1.invoices[0].total).toBe(10);

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
	expect(customer2.invoices?.length).toBe(3);
	expect(customer2.invoices?.[0].total).toBe(10);
}, 120000);

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
test.concurrent(`${chalk.yellowBright("attach: entities with new_billing_subscription (separate subs)")}`, async () => {
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
	expectProductAttached({ customer: entity1, productId: premium.id });

	// Attach premium to entity 2 → 3 subs
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: premium.id,
		new_billing_subscription: true,
	});

	await expectSubCount({ ctx, customerId, count: 3 });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CusExpand.Invoices],
	});

	const customerPro = customer.products.find((p) => p.id === pro.id);
	expect(customerPro).toBeDefined();
	expect(customerPro?.status).toBe("active");

	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	const e1Premium = entity1Final.products?.find(
		(p: { id?: string }) => p.id === premium.id,
	);
	expect(e1Premium).toBeDefined();
	expect(e1Premium!.status).toBe("active");

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	const e2Premium = entity2Final.products?.find(
		(p: { id?: string }) => p.id === premium.id,
	);
	expect(e2Premium).toBeDefined();
	expect(e2Premium!.status).toBe("active");
}, 120000);

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
test.concurrent(`${chalk.yellowBright("attach: customer upgrade doesn't affect entity separate sub")}`, async () => {
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

	const customerBefore = await autumnV1.customers.get(customerId);
	expectProductAttached({ customer: customerBefore, productId: pro.id });

	const entityBefore = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entityBefore, productId: premium.id });

	// Upgrade customer from pro → premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customerAfter, productId: premium.id });

	// Pro should be gone from customer-level products
	const proProduct = customerAfter.products.find(
		(p) => p.id === pro.id && !p.entity_id,
	);
	expect(proProduct).toBeUndefined();

	// Still 2 subs (customer premium + entity premium on separate sub)
	await expectSubCount({ ctx, customerId, count: 2 });

	// Entity should still have premium on its separate sub
	const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
	const entityProducts = entityAfter.products!;
	expect(entityProducts.length).toBe(1);
	const entityPremium = entityProducts.find(
		(p: { id?: string }) => p.id === premium.id,
	);
	expect(entityPremium).toBeDefined();
	expect(entityPremium!.status).toBe("active");

	const invoices = customerAfter.invoices;
	expect(invoices).toBeDefined();
	expect(invoices!.length).toBeGreaterThanOrEqual(1);
}, 120000);
