/**
 * Legacy Attach V1 Separate Subscription Tests
 *
 * Migrated from:
 * - server/tests/merged/separate/separate1.test.ts (separate subs via invoice checkout)
 * - server/tests/merged/separate/separate2.test.ts (separate subs via force_checkout + add-on)
 *
 * Tests V1 attach behavior when entities get separate subscriptions (not merged).
 * Separate subs are created when:
 * - invoice: true → creates invoice checkout per entity
 * - force_checkout: true → creates Stripe checkout session per entity
 *
 * Each entity gets its own Stripe subscription ID, not shared.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import {
	completeInvoiceCheckout,
	completeStripeCheckoutForm,
} from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Separate subscriptions via invoice checkout
// (from separate1)
//
// Scenario:
// - Pro ($20) and Premium ($50) products with 100 messages
// - 2 entities, no payment method on customer
// - Attach Pro to entity 1 with invoice: true → get checkout_url, complete it
// - Attach Pro to entity 2 with invoice: true → get checkout_url, complete it
// - Verify entity 1 and entity 2 have DIFFERENT subscription IDs
// - Upgrade both entities to Premium (normal attach, no invoice)
// - Verify subs remain separate and correct
//
// Expected:
// - Each entity gets its own subscription
// - After upgrade, subs are still separate
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-separate 1: separate subs via invoice checkout")}`, async () => {
	const customerId = "legacy-separate-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	// Use v1.2 client (matches original test)
	const autumnV1_2 = new AutumnInt({ version: LegacyVersion.v1_2 });

	const { entities } = await initScenario({
		customerId,
		setup: [
			// No payment method — invoice checkout will provide the payment page
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Note: initScenario mutates product.id in-place, so pro.id/premium.id are already prefixed

	// Attach Pro to entity 1 with invoice: true
	const res1 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		entity_id: entities[0].id,
	});
	await completeInvoiceCheckout({ url: res1.checkout_url, isolatedBrowser: true });

	// Attach Pro to entity 2 with invoice: true
	const res2 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		entity_id: entities[1].id,
	});
	await completeInvoiceCheckout({ url: res2.checkout_url, isolatedBrowser: true });

	// Verify different subscription IDs per entity
	const fullCus = await CusService.getFull({
		idOrInternalId: customerId,
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).toBeDefined();
	expect(entity2SubId).toBeDefined();
	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	// Upgrade both entities to Premium (normal attach, not invoice mode)
	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity2SubId,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Separate subscriptions via force_checkout + add-on
// (from separate2)
//
// Scenario:
// - Pro ($20) and Premium ($50) products with 100 messages
// - Credits add-on (prepaid, $10/100 credits)
// - 2 entities, no payment method on customer
// - Attach Pro to entity 1 with force_checkout → complete checkout form
// - Attach Pro to entity 2 with force_checkout → complete checkout form
// - Verify entity 1 and entity 2 have DIFFERENT subscription IDs
// - Upgrade both entities to Premium (normal attach)
// - Attach add-on to entity 2 → should merge into entity 2's sub
// - Verify add-on's sub ID matches entity 2's sub ID
//
// Expected:
// - Each entity gets its own subscription
// - Add-on merges into the correct entity's subscription
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-separate 2: separate subs via force_checkout + add-on")}`, async () => {
	const customerId = "legacy-separate-2";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const addOnBillingUnits = 100;
	const addOn = products.base({
		id: "credits-addon",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits: addOnBillingUnits,
				includedUsage: 0,
				price: 10,
			}),
		],
		isAddOn: true,
	});

	// Use v1.2 client (matches original test)
	const autumnV1_2 = new AutumnInt({ version: LegacyVersion.v1_2 });

	const { entities } = await initScenario({
		customerId,
		setup: [
			// No payment method — force_checkout will provide the payment page
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Note: initScenario mutates product.id in-place, so pro.id/premium.id/addOn.id are already prefixed

	// Attach Pro to entity 1 with force_checkout
	const res1 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		force_checkout: true,
		entity_id: entities[0].id,
	});
	expect(res1.checkout_url).toBeDefined();
	await completeStripeCheckoutForm({ url: res1.checkout_url });

	// Attach Pro to entity 2 with force_checkout
	const res2 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		force_checkout: true,
		entity_id: entities[1].id,
	});
	expect(res2.checkout_url).toBeDefined();
	await completeStripeCheckoutForm({ url: res2.checkout_url });

	// Verify different subscription IDs per entity
	let fullCus = await CusService.getFull({
		idOrInternalId: customerId,
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	let cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).toBeDefined();
	expect(entity2SubId).toBeDefined();
	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	// Upgrade both entities to Premium
	for (const entity of entities) {
		await autumnV1_2.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entity.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subId: entity1SubId!,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subId: entity2SubId!,
		});
	}

	// Attach add-on to entity 2 (should merge into entity 2's sub)
	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[1].id,
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: addOnBillingUnits * 2,
			},
		],
	});

	// Verify add-on's sub ID matches entity 2's sub ID
	fullCus = await CusService.getFull({
		idOrInternalId: customerId,
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	cusProducts = fullCus.customer_products;
	const addOnProd = cusProducts.find((cp) => cp.product.id === addOn.id);

	expect(addOnProd).toBeDefined();
	const addOnSubId = addOnProd?.subscription_ids?.[0];
	expect(addOnSubId).toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity2SubId,
	});
});
