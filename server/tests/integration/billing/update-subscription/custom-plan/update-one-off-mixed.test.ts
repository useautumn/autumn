import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { FreeTrialDuration } from "autumn-js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// MIXED ONE-OFF AND RECURRING PRODUCT UPDATES
//
// These tests cover updates that involve both recurring and one-off components.
// Tests the interaction between recurring base prices and one-off prepaid items.
//
// Test scenarios:
// - Free product → Recurring product with one-off prepaid item
// - Recurring product → Same product + one-off prepaid item
// - Product with one-off prepaid → Updated product retaining one-off prepaid
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: FREE → RECURRING + ONE-OFF
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("mixed: free product → recurring product with one-off prepaid item")}`, async () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProduct = products.base({
		items: [freeMessagesItem],
		id: "free",
		isDefault: true,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "free-to-recurring-with-oneoff",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProduct] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	// Update to recurring product with base price + one-off prepaid messages
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });
	const dashboardItem = items.dashboard();
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 200; // 2 packs of one-off messages

	const updateParams = {
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [monthlyBasePrice, dashboardItem, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Base price ($20) + one-off messages (2 packs * $10 = $20) = $40
	const expectedTotal = 20 + (quantity / 100) * 10;
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify dashboard feature enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Verify one-off messages quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// Should have 2 invoices: initial free attach + update with charges
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: RECURRING → SAME RECURRING + ONE-OFF
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("mixed: recurring product → same product + one-off prepaid item")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });

	const proProduct = products.base({
		items: [dashboardItem, monthlyBasePrice],
		id: "pro",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "recurring-add-oneoff",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [s.attach({ productId: proProduct.id, timeout: 4000 })],
	});

	// Update to add one-off prepaid messages
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 300; // 3 packs

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for one-off messages only
	const expectedCharge = (quantity / 100) * 10; // 3 packs * $10
	expect(preview.total).toBe(expectedCharge);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Dashboard should still be enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Total messages = free monthly (100) + one-off quantity (300)
	// Usage preserved from free messages
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// Should have 2 invoices: initial pro attach + one-off purchase
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2B: RECURRING → SAME RECURRING + ONE-OFF (MID-CYCLE)
// One-off prices should NOT be prorated, so full price even mid-cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("mixed: recurring + one-off mid-cycle (no proration on one-off)")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });

	const proProduct = products.base({
		items: [dashboardItem, monthlyBasePrice],
		id: "pro",
	});

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "recurring-oneoff-midcycle",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [s.attach({ productId: proProduct.id })],
	});

	// Advance 15 days (mid-cycle)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	// Update to add one-off prepaid messages mid-cycle
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 300; // 3 packs

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// One-off prices should NOT be prorated - full price even mid-cycle
	const expectedCharge = (quantity / 100) * 10; // 3 packs * $10 = $30
	expect(preview.total).toBe(expectedCharge);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Dashboard should still be enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// One-off messages should be available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// Should have 2 invoices: initial pro attach + one-off purchase
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: RECURRING WITH ONE-OFF → UPDATED RECURRING WITH SAME ONE-OFF
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("mixed: recurring with one-off → updated recurring retaining one-off")}`, async () => {
	const dashboardItem = items.dashboard();
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proProduct = products.pro({
		items: [dashboardItem, oneOffMessagesItem],
		id: "pro-v1",
	});

	const initialQuantity = 200; // 2 packs

	const { customerId, autumnV1 } = await initScenario({
		customerId: "recurring-with-oneoff-update",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProduct] }),
		],
		actions: [
			s.attach({
				productId: proProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	// Track some usage
	const messagesUsed = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Update to new product version with:
	// - Increased base price
	// - Added feature (monthly words)
	// - Same one-off prepaid messages (same quantity)
	const monthlyBasePrice = items.monthlyPrice({ price: 30 }); // Increased from $20
	const wordsItem = items.monthlyWords({ includedUsage: 50 }); // New feature

	const updateParams = {
		customer_id: customerId,
		product_id: proProduct.id,
		items: [monthlyBasePrice, dashboardItem, wordsItem, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// One-off items are charged again on update
	// One-off messages: (200 / 100) * $10 = $20
	// Base price increase: $30 - $20 = $10 (full cycle remaining)
	const oneOffCharge = (initialQuantity / 100) * 10;
	const basePriceDiff = 30 - 20;
	const expectedTotal = oneOffCharge + basePriceDiff;
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Dashboard should still be enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// New words feature should be available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// One-off messages should retain usage and quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: initialQuantity,
		balance: initialQuantity - messagesUsed,
		usage: messagesUsed,
	});

	// Should have 2 invoices: initial attach with one-off + update with price increase
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: FREE → TRIAL WITH ONE-OFF ITEM
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("mixed: free → trial product with one-off prepaid item")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const freeProduct = products.base({
		id: "free-starter",
		items: [dashboardItem],
		isDefault: false,
	});

	// const proTrial = products.base({
	// 	items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
	// 	id: "pro-trial-oneoff",
	// 	trialDays: 14,
	// });

	const quantity = 200; // 2 packs

	const { customerId, autumnV1 } = await initScenario({
		customerId: "free-to-trial-oneoff",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeProduct] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	// Update from free → trial product with one-off item
	const updateParams = {
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: true,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// One-off should be charged immediately, base price deferred until trial ends
	const oneOffCharge = (quantity / 100) * 10;
	expect(preview.total).toBe(oneOffCharge); // $20

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Dashboard should be enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// One-off messages should be available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	// Should have 1 invoice for the one-off charge
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
