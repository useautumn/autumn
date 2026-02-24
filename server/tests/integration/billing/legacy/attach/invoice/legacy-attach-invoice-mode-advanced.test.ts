/**
 * Legacy Attach V1 Invoice Mode Advanced Tests
 *
 * Migrated from:
 * - server/tests/attach/checkout/checkout6.test.ts (invoice via /checkout endpoint)
 * - server/tests/attach/checkout/checkout7.test.ts (invoice with one-off add-on + quantity)
 *
 * Tests V1 invoice mode scenarios using the /checkout endpoint:
 * - New subscription via /checkout with invoice: true
 * - Upgrade with enable_product_immediately and draft invoice
 * - One-off add-on with quantity options via /checkout
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Invoice checkout via /checkout endpoint
// (from checkout6 - first test)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - Attach via /checkout endpoint with invoice: true
//
// Expected:
// - Returns checkout URL
// - Product attached after invoice payment
// - Features correct
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 1: /checkout endpoint new subscription")}`, async () => {
	const customerId = "legacy-inv-mode-adv-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.checkout({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
	});

	expect(res.url).toBeDefined();

	await completeInvoiceCheckoutV2({ url: res.url! });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade with enable_product_immediately and draft invoice
// (from checkout6 - second test)
//
// Scenario:
// - Pro product ($20/month) attached normally
// - Upgrade to Premium ($50/month) with:
//   - invoice: true
//   - enable_product_immediately: true
//   - finalize_invoice: false
//
// Expected:
// - No checkout URL (auto-charged or draft)
// - Premium product active immediately
// - Invoice is draft with proration amount ($30)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 2: upgrade with enable_product_immediately draft invoice")}`, async () => {
	const customerId = "legacy-inv-mode-adv-2";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 250 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	});

	// No checkout URL when finalize_invoice: false
	expect(res.checkout_url).toBeFalsy();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 250,
		usage: 0,
	});

	// 2 invoices: pro $20 (paid) + premium upgrade proration $30 (draft)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 30, // Premium $50 - Pro $20 proration
		latestStatus: "draft",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off add-on with quantity via /checkout
// (from checkout7)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - One-off add-on with prepaid Messages ($10/100 units)
// - Attach pro, then add-on via /checkout with quantity 200
//
// Expected:
// - Returns checkout URL
// - Add-on attached after payment
// - Messages balance = 100 (pro) + 200 (add-on) = 300
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 3: one-off add-on with quantity via /checkout")}`, async () => {
	const customerId = "legacy-inv-mode-adv-3";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addOnMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 100,
		includedUsage: 0,
	});
	const addOn = products.base({
		id: "addon",
		items: [addOnMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const options = [
		{
			quantity: 200,
			feature_id: TestFeature.Messages,
		},
	];

	const res = await autumnV1.checkout({
		customer_id: customerId,
		product_id: addOn.id,
		invoice: true,
		options,
	});

	expect(res.url).toBeDefined();

	await completeInvoiceCheckoutV2({ url: res.url! });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	// Messages: 100 (pro monthly) + 200 (one-off add-on) = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// 2 invoices: pro $20 + add-on $20 (2 packs x $10)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20, // 2 packs x $10
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Separate subscriptions due to invoice checkout (per entity)
// (from separate1)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - Premium product ($50/month) with Messages (100 included)
// - 2 entities, attach Pro to each with invoice: true (separate checkouts)
// - Upgrade both to Premium
//
// Expected:
// - Each entity gets a separate subscription (not merged)
// - Upgrades work correctly on separate subs
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-inv-mode-adv 4: separate subs due to invoice checkout")}`, async () => {
	const customerId = "legacy-inv-mode-adv-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const { db, org, env } = ctx;

	// Attach Pro to each entity with invoice checkout (creates separate subs)
	for (const entity of entities) {
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entity.id,
			invoice: true,
		});

		await completeInvoiceCheckoutV2({ url: res.checkout_url });
	}

	// Verify separate subscriptions
	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity1SubId,
	});

	// Upgrade both entities to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	// Verify subs still correct after upgrades
	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity1SubId,
	});

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		subId: entity2SubId,
	});

	// Verify entities have Premium
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
});
