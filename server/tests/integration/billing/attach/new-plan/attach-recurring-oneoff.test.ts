/**
 * Attach Recurring + One-Off Tests (Attach V2)
 *
 * Tests for attaching products that have BOTH recurring prices AND one-off prepaid items.
 * This is a mixed product configuration that requires special handling.
 *
 * Key behaviors:
 * - Both recurring subscription + one-time payment are processed together
 * - Recurring features (prepaid words) reset monthly
 * - One-off features (one-off messages) never reset
 * - Quantities can be requested for both types of features
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach product with both recurring and one-off items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with payment method
 * - Product has:
 *   - Monthly base price: $20
 *   - Monthly prepaid words (recurring): $15/pack (100 units)
 *   - One-off messages: $10/pack (100 units)
 * - Request 100 units of each feature
 *
 * Expected Result:
 * - Product attached successfully
 * - Invoice: $20 (base) + $15 (words) + $10 (messages) = $45
 * - Words: 100 balance (recurring, resets monthly)
 * - Messages: 100 balance (one-off, never resets)
 */
test.concurrent(`${chalk.yellowBright("recurring-oneoff 1: attach with both items")}`, async () => {
	const customerId = "recurring-oneoff-attach-both";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	// Monthly prepaid words (recurring)
	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});

	// One-off messages
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});

	const pro = products.pro({
		id: "pro-recurring-oneoff",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Request 100 units of each feature (1 pack each)
	const wordsQuantity = 100;
	const messagesQuantity = 100;
	const expectedTotal = basePrice + wordsPricePerPack + messagesPricePerPack; // $45

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attach product
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});

	// 3. Verify product is attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify words feature (recurring prepaid)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
		usage: 0,
	});

	// Verify messages feature (one-off)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach product with only one-off quantity (no recurring qty)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with payment method
 * - Product has:
 *   - Monthly base price: $20
 *   - Monthly prepaid words (recurring): $15/pack - NOT REQUESTED
 *   - One-off messages: $10/pack (100 units)
 * - Only request one-off messages quantity (no words)
 *
 * Expected Result:
 * - Product attached successfully
 * - Invoice: $20 (base) + $10 (messages) = $30 (no words charge)
 * - Words: 0 balance (none purchased)
 * - Messages: 100 balance (one-off)
 */
test.concurrent(`${chalk.yellowBright("recurring-oneoff 2: attach with only one-off qty")}`, async () => {
	const customerId = "recurring-oneoff-attach-oneoff-only";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	// Monthly prepaid words (recurring) - won't be purchased
	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});

	// One-off messages - will be purchased
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});

	const pro = products.pro({
		id: "pro-recurring-oneoff",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Only request one-off messages, no words
	const messagesQuantity = 100;
	const expectedTotal = basePrice + messagesPricePerPack; // $30

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attach product
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	// 3. Verify product is attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify words feature - 0 balance (not purchased)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 0,
		usage: 0,
	});

	// Verify messages feature (one-off)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
