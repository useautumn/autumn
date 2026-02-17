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
test.concurrent(`${chalk.yellowBright("new-billing-sub 1: addon creates separate subscription")}`, async () => {
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
});

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
test.concurrent(`${chalk.yellowBright("new-billing-sub 2: repeated addon creates additional subs")}`, async () => {
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
});

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
test.concurrent(`${chalk.yellowBright("new-billing-sub 3: entities get separate subs")}`, async () => {
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

	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Final,
		productId: premium.id,
	});

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Final,
		productId: premium.id,
	});
}, 120000);

// =============================================================================
// TEST 4: Upgrade ignores new_billing_subscription
// =============================================================================

/**
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Attach Premium ($50/mo) with new_billing_subscription: true
 *
 * Expected:
 * - Still 1 subscription (flag silently ignored for upgrades)
 * - Premium active, Pro replaced
 * - Prorated invoice (not a fresh $50 invoice)
 */
test.concurrent(`${chalk.yellowBright("new-billing-sub 4: upgrade ignores flag")}`, async () => {
	const customerId = "new-billing-sub-v2-upgrade-ignored";

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
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Attach premium with new_billing_subscription (should be ignored)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		new_billing_subscription: true,
		redirect_mode: "if_required",
	});

	// Still 1 subscription — flag was ignored
	await expectSubCount({ ctx, customerId, count: 1 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Normal upgrade: premium active, pro gone
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Should have 2 invoices (initial pro + upgrade proration), not 2 separate full-price invoices
	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});
});

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
test.concurrent(`${chalk.yellowBright("new-billing-sub 5: downgrade ignores flag")}`, async () => {
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
});

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
test.concurrent(`${chalk.yellowBright("new-billing-sub 6: customer upgrade doesn't affect entity separate sub")}`, async () => {
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
}, 120000);
