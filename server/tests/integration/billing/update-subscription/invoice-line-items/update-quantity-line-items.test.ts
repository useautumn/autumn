/**
 * Update Quantity Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when updating quantities via the billing v2 flow.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Increase quantity - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with prepaid messages (100 initial)
 * - Increase quantity from 100 to 400 (+300)
 *
 * Expected Result:
 * - Invoice created for quantity increase
 * - Invoice line items are persisted to DB:
 *   - Refund for old quantity: 1 pack × $10 = -$10, quantity=100
 *   - Charge for new quantity: 4 packs × $10 = $40, quantity=400
 *   - Net: $30
 * - prorated: true (mid-cycle quantity change)
 * - customer_product_id populated
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 1: increase quantity - line items persisted")}`, async () => {
	const customerId = "update-qty-li-increase";
	const billingUnits = 100;
	const pricePerPack = 10;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Initial attach with 100 messages (1 pack = $10)
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Increase from 100 to 400 (+300 = net +3 packs = $30)
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages increased
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 400,
	});

	// Verify invoice total: 4 packs - 1 pack = $40 - $10 = $30
	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: pro.id,
		amount: 30,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 30, // 4 packs - 1 pack = $40 - $10 = $30
		expectedLineItems: [
			// Refund for old quantity: 1 pack × $10 = -$10
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Charge for new quantity: 4 packs × $10 = $40
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 40,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Increase quantity with multiple features - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with prepaid messages AND prepaid words
 * - Increase both quantities simultaneously
 *
 * Expected Result:
 * - Invoice line items for both features are persisted:
 *   - Messages: refund 1 pack (-$10, qty=100), charge 3 packs ($30, qty=300) = net $20
 *   - Words: refund 1 pack (-$5, qty=100), charge 4 packs ($20, qty=400) = net $15
 *   - Total: $35
 * - Each feature's line items are correctly attributed
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 2: increase multiple features - line items persisted")}`, async () => {
	const customerId = "update-qty-li-multi-feature";
	const messagesBillingUnits = 100;
	const wordsBillingUnits = 100;
	const messagesPricePerPack = 10;
	const wordsPricePerPack = 5;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: messagesBillingUnits,
		price: messagesPricePerPack,
	});

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: wordsBillingUnits,
		price: wordsPricePerPack,
	});

	const pro = products.pro({
		id: "pro-multi-prepaid",
		items: [prepaidMessages, prepaidWords],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Initial attach with both features
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
		],
	});

	// Increase both:
	// Messages: 100 → 300 (refund 1 pack = -$10, charge 3 packs = $30, net = $20)
	// Words: 100 → 400 (refund 1 pack = -$5, charge 4 packs = $20, net = $15)
	// Total: $35
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 300 },
			{ feature_id: TestFeature.Words, quantity: 400 },
		],
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 35, // $20 (messages) + $15 (words)
		expectedLineItems: [
			// Messages: refund 1 pack × $10 = -$10
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Messages: charge 3 packs × $10 = $30
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 30,
				direction: "charge",
				totalQuantity: 300,
				paidQuantity: 300,
			},
			// Words: refund 1 pack × $5 = -$5
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: -5,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			// Words: charge 4 packs × $5 = $20
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: 20,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: ProrateNextCycle increase - deferred proration on renewal invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with prepaid messages (on_increase: ProrateNextCycle, 0 included, $10/100 units)
 * - Attach with 100 messages (1 pack = $10)
 * - Advance 15 days (mid-cycle)
 * - Increase from 100 → 400 (+3 packs)
 * - No immediate invoice (deferred to next cycle)
 * - Advance to next billing cycle
 *
 * Expected Renewal Invoice Line Items:
 * - Prorated refund for old quantity (1 pack, ~half-period) — direction=refund, prorated=true
 * - Prorated charge for new quantity (4 packs, ~half-period) — direction=charge, prorated=true
 * - Full renewal base price ($20) — direction=charge, prorated=false
 * - Full renewal prepaid charge (4 packs × $10 = $40) — direction=charge, prorated=false
 * - All linked to correct productId and featureId
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 3: prorate next cycle increase - deferred proration on renewal")}`, async () => {
	const customerId = "update-qty-li-prorate-next";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const pro = products.pro({
		id: "pro-prorate-next",
		items: [prepaidMessages],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach with 100 messages (1 pack = $10)
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

	// Preview should show $0 (deferred to next cycle)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});
	expect(preview.total).toBe(0);

	// Update quantity from 100 → 400
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	// Balance should be updated immediately
	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: afterUpdate,
		featureId: TestFeature.Messages,
		balance: 400,
	});

	// No new finalized invoice yet
	const finalizedInvoices = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have a new invoice
	await expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
	});

	const renewalInvoice = afterCycle.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify renewal invoice has deferred prorated + renewal line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedLineItems: [
			// Base price renewal ($20, not prorated)
			{
				isBasePrice: true,
				direction: "charge",
				amount: basePrice,
				productId: pro.id,
			},
			// Deferred prorated refund for old quantity (1 pack, prorated ~half-period)
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				billingTiming: "in_advance",
				prorated: true,
				productId: pro.id,
				totalAmount: -10,
				minCount: 1,
			},

			// Full renewal charge for new quantity (4 packs × $10 = $40, not prorated)
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				totalAmount: 80,
				productId: pro.id,
				minCount: 2,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: ProrateNextCycle increase with multiple features - deferred prorations on renewal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with:
 *   - Prepaid messages (on_increase: ProrateNextCycle, 0 included, $10/100 units)
 *   - Prepaid words (on_increase: ProrateNextCycle, 0 included, $5/100 units)
 * - Attach with 100 messages + 100 words
 * - Advance 15 days (mid-cycle)
 * - Increase messages 100→300, words 100→400
 * - Advance to next billing cycle
 *
 * Expected Renewal Invoice Line Items:
 * - Base price renewal ($20)
 * - Messages: prorated refund + prorated charge (deferred) + full renewal (3 packs × $10 = $30)
 * - Words: prorated refund + prorated charge (deferred) + full renewal (4 packs × $5 = $20)
 * - All linked to correct productId and featureId
 */
test.concurrent(`${chalk.yellowBright("update-quantity-line-items 4: prorate next cycle multi-feature - deferred prorations on renewal")}`, async () => {
	const customerId = "update-qty-li-prorate-next-multi";
	const billingUnits = 100;
	const messagesPricePerPack = 10;
	const wordsPricePerPack = 5;
	const basePrice = 20;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const pro = products.pro({
		id: "pro-prorate-next-multi",
		items: [prepaidMessages, prepaidWords],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach with 100 messages + 100 words
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
			// Advance 15 days to mid-cycle
			s.advanceTestClock({ days: 15 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

	// Update both features
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 300 },
			{ feature_id: TestFeature.Words, quantity: 400 },
		],
	});

	// Balances should be updated immediately
	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: afterUpdate,
		featureId: TestFeature.Messages,
		balance: 300,
	});
	expectCustomerFeatureCorrect({
		customer: afterUpdate,
		featureId: TestFeature.Words,
		balance: 400,
	});

	await expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have a new invoice
	await expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
	});

	const renewalInvoice = afterCycle.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify renewal invoice has deferred prorated + renewal line items for both features
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedLineItems: [
			// Base price renewal ($20)
			{
				isBasePrice: true,
				direction: "charge",
				amount: basePrice,
				prorated: false,
				productId: pro.id,
			},

			// --- Messages ---
			// Deferred prorated refund (old: 1 pack)
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				prorated: true,
				productId: pro.id,
				minCount: 1,
			},
			// Deferred prorated charge (new: 3 packs)
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				prorated: true,
				productId: pro.id,
				minCount: 1,
			},
			// Full renewal (3 packs × $10 = $30)
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				prorated: false,
				totalAmount: 30,
				productId: pro.id,
				minCount: 1,
			},

			// --- Words ---
			// Deferred prorated refund (old: 1 pack)
			{
				featureId: TestFeature.Words,
				direction: "refund",
				prorated: true,
				productId: pro.id,
				minCount: 1,
			},
			// Deferred prorated charge (new: 4 packs)
			{
				featureId: TestFeature.Words,
				direction: "charge",
				prorated: true,
				productId: pro.id,
				minCount: 1,
			},
			// Full renewal (4 packs × $5 = $20)
			{
				featureId: TestFeature.Words,
				direction: "charge",
				prorated: false,
				totalAmount: 20,
				productId: pro.id,
				minCount: 1,
			},
		],
	});
});
