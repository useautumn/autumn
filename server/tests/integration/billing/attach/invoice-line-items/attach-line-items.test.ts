/**
 * Attach Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when attaching products via the billing v2 flow.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
// TEST 1: Attach pro with all feature types - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach Pro ($20/mo) with mixed features:
 *   - Free messages (100 included)
 *   - Prepaid messages ($10/100 units) - purchase 500
 *   - Consumable words (50 included)
 *   - Allocated users (3 included) - create 5 entities = 2 overage
 *
 * Expected Result:
 * - Invoice created with line items persisted to DB
 * - Line items include:
 *   - Base price ($20) charge
 *   - Prepaid messages (4 packs × $10 = $40) charge
 *   - Allocated users overage (2 × $10 = $20) charge
 * - Total: $80
 * - Each line item has prorated: false (start of cycle)
 * - Each line item has billing_timing: "in_advance" for prepaid/allocated
 */
test.concurrent(`${chalk.yellowBright("attach-line-items 1: attach pro with all feature types")}`, async () => {
	const customerId = "attach-li-all-features";

	// Pro product with all feature types
	const freeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const messagesQuantity = 500;
	const messagesPrice = 10 * 4; // $40 for 4 packs (500 - 100 included = 400, 400/100 = 4 packs)
	const allocatedUsersPrice = 10 * 2; // $20 for 2 overage seats
	const basePrice = 20;
	const expectedTotal = basePrice + messagesPrice + allocatedUsersPrice; // $80

	const pro = products.pro({
		id: "pro-all-features",
		items: [freeMessages, prepaidMessages, consumableWords, allocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [],
	});

	// Attach pro with prepaid quantity
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
		redirect_mode: "if_required",
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify features
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity + 100, // 500 purchased + 100 free
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		usage: 5,
	});

	// Verify invoice total
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Base price
			{ isBasePrice: true, amount: basePrice },
			// Prepaid messages (4 packs × $10 = $40)
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
			// Allocated users overage (2 seats × $10 = $20)
			{ featureId: TestFeature.Users, totalAmount: allocatedUsersPrice },
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro to Premium upgrade with all paid feature types - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with mixed features:
 *   - Free messages (100 included)
 *   - Prepaid messages ($10/100 units)
 *   - Consumable words (50 included, $0.05/unit overage)
 *   - Allocated users (3 included, $10/seat)
 * - Create 5 user entities (2 overage seats)
 * - Track 100 words (50 overage)
 * - Attach prepaid messages quantity
 * - Upgrade to Premium ($50/mo) with same feature structure
 *
 * Expected Result:
 * - Invoice line items are persisted to DB
 * - Line items include: base price proration, prepaid charges, allocated seat charges
 * - Each line item has correct metadata (price_id, product_id, prorated flag, etc.)
 */
test.concurrent(`${chalk.yellowBright("attach-line-items 2: pro to premium upgrade with all feature types")}`, async () => {
	const customerId = "attach-li-upgrade";

	// Pro product with all feature types
	const proFreeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const proPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proConsumableWords = items.consumableWords({ includedUsage: 50 });
	const proAllocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [
			proFreeMessages,
			proPrepaidMessages,
			proConsumableWords,
			proAllocatedUsers,
		],
	});

	// Premium product with same features but higher base price
	const premiumFreeMessages = items.lifetimeMessages({ includedUsage: 200 });
	const premiumPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premiumConsumableWords = items.consumableWords({ includedUsage: 100 });
	const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });

	const premium = products.premium({
		id: "premium-all-features",
		items: [
			premiumFreeMessages,
			premiumPrepaidMessages,
			premiumConsumableWords,
			premiumAllocatedUsers,
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [
			// Attach pro with prepaid quantity and allocated users will auto-track via entities
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			// Track words into overage (100 words, 50 included = 50 overage)
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 5000 }),
		],
	});

	// Upgrade to premium with prepaid quantity
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify invoice exists
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial pro invoice + upgrade invoice
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedCount: 6,
		expectedLineItems: [
			// Refunds from Pro (prorated)
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
			},
			{ featureId: TestFeature.Messages, direction: "refund", minCount: 1 },
			{ featureId: TestFeature.Users, direction: "refund", minCount: 1 },

			// Charges for Premium
			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
			},
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				minCount: 1,
			},

			// Words overage (in_arrear charge from Pro usage)
			// 100 words tracked, 50 included = 50 overage × $0.05 = $2.50
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				totalAmount: 2.5,
				count: 1,
			},
		],
	});
});
