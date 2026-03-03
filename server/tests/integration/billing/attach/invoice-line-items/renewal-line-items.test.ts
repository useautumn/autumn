/**
 * Renewal Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when a subscription renews (via invoice.created / invoice.finalized webhooks).
 *
 * Uses s.advanceToNextInvoice() to trigger the billing cycle renewal.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Single product with all feature types - consumable tracked into overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with mixed features:
 *   - Lifetime messages (100 included) - free metered, no cost
 *   - Prepaid messages ($10/100 units) - purchase 500
 *   - Consumable words (50 included, $0.05/unit overage) - track 200 (150 overage)
 *   - Allocated users (3 included, $10/seat) - 5 entities = 2 overage
 * - Advance to next billing cycle
 *
 * Expected Renewal Invoice Line Items:
 * - Base price: $20 (in_advance)
 * - Prepaid messages: $40 (4 packs × $10, in_advance)
 * - Allocated users: $20 (2 overage × $10, in_advance)
 * - Consumable words overage: $7.50 (150 × $0.05, in_arrear from previous cycle)
 */
test.concurrent(`${chalk.yellowBright("renewal-li 1: single product with all feature types + consumable overage")}`, async () => {
	const customerId = "renewal-li-all-features";

	// Product with all feature types
	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [lifetimeMessages, prepaidMessages, consumableWords, allocatedUsers],
	});

	const basePrice = 20;
	const prepaidQuantity = 500;
	const prepaidPrice = 10 * 4; // 4 packs (500 - 100 included = 400, 400/100 = 4 packs)
	const allocatedPrice = 10 * 2; // 2 overage seats × $10
	const wordsTracked = 200;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected consumable overage
	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: [consumableWords],
		usage: [{ featureId: TestFeature.Words, value: wordsTracked }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be active
	await expectProductActive({ customer, productId: pro.id });

	// Should have 2 invoices: initial + renewal
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	// Get renewal invoice stripe_id
	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify renewal invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			// Base price renewed ($20)
			{ isBasePrice: true, amount: basePrice },
			// Prepaid messages renewed (4 packs × $10 = $40)
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: prepaidPrice,
			},
			// Allocated users renewed (2 overage × $10 = $20)
			{
				featureId: TestFeature.Users,
				billingTiming: "in_advance",
				totalAmount: allocatedPrice,
			},
			// Consumable words overage from previous cycle (in_arrear)
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: expectedWordsOverage,
			},
		],
	});

	// Verify consumable balance reset to included usage
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multi-product - Pro + Recurring Add-on (shared subscription)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with prepaid messages ($10/100 units) - purchase 300
 * - Customer has Recurring Add-on ($20/mo) with consumable words (100 included)
 * - Track 300 words (200 overage)
 * - Advance to next billing cycle
 *
 * Expected Renewal Invoice Line Items:
 * - Pro base price: $20
 * - Pro prepaid messages: $20 (2 packs × $10)
 * - Add-on base price: $20
 * - Add-on consumable words overage (200 × $0.05 = $10, in_arrear)
 */
test.concurrent(`${chalk.yellowBright("renewal-li 2: multi-product pro + recurring add-on")}`, async () => {
	const customerId = "renewal-li-multi-product";

	// Pro with prepaid
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidMessages],
	});

	// Recurring add-on with consumable
	const consumableWords = items.consumableWords({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon-consumable",
		items: [consumableWords],
	});

	const proBasePrice = 20;
	const addonBasePrice = 20;
	const prepaidQuantity = 300;
	const prepaidPrice = 10 * 2; // 2 packs (300 - 100 = 200, 200/100 = 2 packs)
	const wordsTracked = 300;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: prepaidQuantity },
				],
			}),
			s.billing.attach({ productId: addon.id }),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected consumable overage
	const expectedWordsOverage = calculateExpectedInvoiceAmount({
		items: [consumableWords],
		usage: [{ featureId: TestFeature.Words, value: wordsTracked }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both products should be active
	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: addon.id });

	// Get renewal invoice (most recent)
	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify renewal invoice line items from both products
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			// Pro base price ($20)
			{ isBasePrice: true, productId: pro.id, amount: proBasePrice },
			// Pro prepaid messages (2 packs × $10 = $20)
			// totalQuantity = 300 (100 included + 200 purchased)
			// paidQuantity = 200 (only the purchased portion)
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: prepaidPrice,
				totalQuantity: prepaidQuantity, // 300 total messages
				paidQuantity: prepaidQuantity,
			},
			// Add-on base price ($20)
			{ isBasePrice: true, productId: addon.id, amount: addonBasePrice },
			// Add-on consumable words overage (in_arrear)
			// totalQuantity = 300 (total words used)
			// paidQuantity = 200 (overage beyond 100 included)
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: expectedWordsOverage,
				totalQuantity: wordsTracked, // 300 total words used
				paidQuantity: wordsTracked - 100, // 200 overage (300 - 100 included)
			},
		],
	});

	// Verify consumable balance reset
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro on entities 1 and 2 (combined subscription, one invoice)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Attach Pro ($20/mo) with prepaid messages to entity 1 (buy 200)
 * - Attach Pro ($20/mo) with prepaid messages to entity 2 (buy 300)
 * - Advance to next billing cycle
 *
 * Expected Renewal Invoice Line Items:
 * - Entity 1: base $20 + prepaid $10 (1 pack for 200-100=100 overage)
 * - Entity 2: base $20 + prepaid $20 (2 packs for 300-100=200 overage)
 */
test.concurrent(`${chalk.yellowBright("renewal-li 3: pro on entities 1 and 2 (combined invoice)")}`, async () => {
	const customerId = "renewal-li-entity-products";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-entity",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const entity1PrepaidQuantity = 200;
	const entity1PrepaidPrice = 10 * 1; // 1 pack (200 - 100 = 100, 100/100 = 1 pack)
	const entity2PrepaidQuantity = 300;
	const entity2PrepaidPrice = 10 * 2; // 2 packs (300 - 100 = 200, 200/100 = 2 packs)

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity1PrepaidQuantity,
					},
				],
				timeout: 2000,
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: entity2PrepaidQuantity,
					},
				],
				timeout: 2000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Get renewal invoice (most recent)
	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify renewal invoice line items from both entities
	// ═══════════════════════════════════════════════════════════════════════════════

	// Expected total: (basePrice + entity1PrepaidPrice) + (basePrice + entity2PrepaidPrice)
	// = ($20 + $10) + ($20 + $20) = $70
	const expectedTotal =
		basePrice * 2 + entity1PrepaidPrice + entity2PrepaidPrice;

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Combined base prices (Stripe merges identical items: 2 × $20 = $40)
			{ isBasePrice: true, totalAmount: basePrice * 2 },
			// Prepaid messages for both entities ($10 + $20 = $30)
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: entity1PrepaidPrice + entity2PrepaidPrice,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium downgrade to Pro - verify Pro renewal line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach Premium ($50/mo) with prepaid messages ($15/100 units) - purchase 500
 * - Schedule downgrade to Pro ($20/mo) with prepaid messages ($10/100 units) - explicit 200
 * - Advance to next billing cycle (downgrade completes)
 *
 * Expected Renewal Invoice (Pro's first cycle):
 * - Pro base price: $20
 * - Pro prepaid messages: $10 (1 pack for 200-100=100 units)
 * - NO Premium line items
 */
test.concurrent(`${chalk.yellowBright("renewal-li 4: premium downgrade to pro - pro renewal line items")}`, async () => {
	const customerId = "renewal-li-downgrade";

	// Premium with prepaid
	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium-prepaid",
		items: [premiumPrepaid],
	});

	// Pro with prepaid
	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [proPrepaid],
	});

	const proBasePrice = 20;
	const proQuantity = 200;
	const proPrepaidPrice = 10 * 1; // 1 pack (200 - 100 = 100, 100/100 = 1 pack)

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
			// Schedule downgrade to pro with explicit quantity
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
				timeout: 2000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	// Verify final state
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Downgrade should be complete: pro active, premium gone
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Get renewal invoice stripe_id (this is Pro's first cycle invoice)
	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify Pro renewal line items, no Premium items
	// ═══════════════════════════════════════════════════════════════════════════════

	const expectedTotal = proBasePrice + proPrepaidPrice; // $20 + $10 = $30

	const lineItems = await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Pro base price ($20)
			{ isBasePrice: true, productId: pro.id, amount: proBasePrice },
			// Pro prepaid messages (1 pack × $10 = $10)
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				productId: pro.id,
				totalAmount: proPrepaidPrice,
			},
		],
	});

	// Verify NO Premium line items exist
	const premiumLineItems = lineItems.filter(
		(li) => li.product_id === premium.id,
	);
	expect(
		premiumLineItems.length,
		`Expected no Premium line items on Pro renewal, found ${premiumLineItems.length}`,
	).toBe(0);

	// Verify prepaid balance reflects Pro's quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: proQuantity,
	});
});
