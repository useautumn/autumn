/**
 * V2 Attach → V1 Uncancel (Renew) Compatibility Tests
 *
 * Tests that verify V1's attach() correctly renews/uncancels a product
 * that was initially attached via V2 billing and then canceled.
 *
 * Flow tested:
 * 1. V2 attach (s.billing.attach)
 * 2. Cancel (s.cancel)
 * 3. V1 attach to same product (autumnV1.attach) → triggers renew flow
 *
 * The renew flow is handled by handleRenewProduct.ts which:
 * - Releases any subscription schedule
 * - Uncancels the Stripe subscription (cancel_at: null)
 * - Clears canceled/ended_at in database
 *
 * V2 attach:
 * - Uses s.billing.attach()
 * - quantity = total units INCLUDING allowance
 *
 * V1 uncancel attach:
 * - Uses autumnV1.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
 * 2. Use s.cancel() to cancel the product
 * 3. Use autumnV1.attach() for V1 renew (same product)
 */

import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: BASIC RENEW - Same quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: basic renew with same quantity")}`, async () => {
	const customerId = "v2-v1-uncancel-basic";
	const billingUnits = 100;
	const includedUsage = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 500 total units (including 100 allowance)
	// = 400 prepaid units = 4 packs
	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 4

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
			// Cancel the product
			s.cancel({ productId: pro.id }),
		],
	});

	// Verify customer is canceled but still has access until period end
	const customerCanceled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerCanceled,
		productId: `${pro.id}_${customerId}`,
	});

	// V1 attach to same product (renew flow)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits, // 400 (excluding allowance)
			},
		],
	});

	// Verify customer is renewed (no longer canceled)
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: `${pro.id}_${customerId}`,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should still have only 1 invoice (no new charge for renew)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: RENEW WITH USAGE TRACKED - Verify usage preserved
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: renew preserves usage")}`, async () => {
	const customerId = "v2-v1-uncancel-usage";
	const billingUnits = 100;
	const includedUsage = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 400 total units (including 100 allowance)
	// = 300 prepaid units = 3 packs
	const initialTotalUnits = 400;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 3

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Track some usage before cancel
	const messagesUsed = 150;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Verify usage tracked
	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerWithUsage,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits - messagesUsed,
		usage: messagesUsed,
	});

	// Cancel the product
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
	});

	// Verify canceled
	const customerCanceled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerCanceled,
		productId: `${pro.id}_${customerId}`,
	});

	// V1 attach to same product (renew flow)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialPacks * billingUnits, // 300 (excluding allowance)
			},
		],
	});

	// Verify customer is renewed with usage preserved
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: `${pro.id}_${customerId}`,
	});

	// Usage should be preserved after renew
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits - messagesUsed,
		usage: messagesUsed,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: RENEW WITH DIFFERENT QUANTITY - Increase
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: renew with increased quantity")}`, async () => {
	const customerId = "v2-v1-uncancel-qty-incr";
	const billingUnits = 100;
	const includedUsage = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 300 total units (including 100 allowance)
	// = 200 prepaid units = 2 packs
	const initialTotalUnits = 300;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
			// Cancel the product
			s.cancel({ productId: pro.id }),
		],
	});

	// Renew with INCREASED quantity
	// New: 500 total = 100 allowance + 400 prepaid = 4 packs
	const newPacks = 4;
	const newTotalUnits = includedUsage + newPacks * billingUnits; // 500

	// V1 attach to same product with increased quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: newPacks * billingUnits, // 400 (excluding allowance)
			},
		],
	});

	// Verify customer is renewed with new quantity
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: `${pro.id}_${customerId}`,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: newTotalUnits,
		balance: newTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should have 2 invoices (initial + proration for increase)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: RENEW WITH DIFFERENT QUANTITY - Decrease
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: renew with decreased quantity")}`, async () => {
	const customerId = "v2-v1-uncancel-qty-decr";
	const billingUnits = 100;
	const includedUsage = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 600 total units (including 100 allowance)
	// = 500 prepaid units = 5 packs
	const initialTotalUnits = 600;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
			// Cancel the product
			s.cancel({ productId: pro.id }),
		],
	});

	// Renew with DECREASED quantity
	// New: 300 total = 100 allowance + 200 prepaid = 2 packs
	const newPacks = 2;
	const newTotalUnits = includedUsage + newPacks * billingUnits; // 300

	// V1 attach to same product with decreased quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: newPacks * billingUnits, // 200 (excluding allowance)
			},
		],
	});

	// Verify customer is renewed with new quantity
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: `${pro.id}_${customerId}`,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: newTotalUnits,
		balance: newTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should have 2 invoices (initial + credit for decrease)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: RENEW SINGLE BILLING UNIT (Users)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: single billing unit (users)")}`, async () => {
	const customerId = "v2-v1-uncancel-users";
	const billingUnits = 1;
	const includedUsage = 5;
	const pricePerUnit = 8;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Users,
		includedUsage,
		billingUnits,
		price: pricePerUnit,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 15 total users (5 free + 10 paid)
	const initialTotalUnits = 15;
	const initialPaidUnits = initialTotalUnits - includedUsage; // 10

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Users, quantity: initialTotalUnits },
				],
			}),
			// Cancel the product
			s.cancel({ productId: pro.id }),
		],
	});

	// V1 attach to same product (renew)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${pro.id}_${customerId}`,
		options: [
			{
				feature_id: TestFeature.Users,
				quantity: initialPaidUnits, // 10 (excluding allowance)
			},
		],
	});

	// Verify customer is renewed
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: `${pro.id}_${customerId}`,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Users,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should still have only 1 invoice
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
	});
});
