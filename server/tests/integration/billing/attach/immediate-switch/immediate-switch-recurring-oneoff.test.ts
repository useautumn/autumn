/**
 * Immediate Switch Recurring + One-Off Tests (Attach V2)
 *
 * Tests for immediate upgrades involving products with mixed recurring + one-off items.
 *
 * Key behaviors:
 * - Immediate switches TO mixed products are supported (upgrade path)
 * - One-off balance from previous product is LOST when switching to product without that one-off item
 * - Mixed products can be attached from any starting point (free, paid)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Pro (with recurring + one-off)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Free (no price, 50 messages)
 * - Upgrade to Pro (mixed: $20/mo + prepaid words + one-off messages)
 *
 * Expected Result:
 * - Immediate upgrade (free → paid)
 * - Invoice: $20 (base) + $15 (words) + $10 (one-off messages) = $45
 * - Features: 100 words (recurring), 100 messages (one-off)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-recurring-oneoff 1: free to pro")}`, async () => {
	const customerId = "imm-switch-ro-free-to-pro";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	// Free product
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [freeMessagesItem] });

	// Pro with mixed recurring + one-off
	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});
	const pro = products.pro({
		id: "pro-mixed",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Verify initial state: Free only
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [free.id],
	});

	// Calculate expected total
	const wordsQuantity = 100;
	const messagesQuantity = 100;
	const expectedTotal = basePrice + wordsPricePerPack + messagesPricePerPack; // $45

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});
	expect(preview.total).toBe(expectedTotal);

	// Upgrade to Pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro active, Free removed
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Words from Pro (recurring prepaid)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
		usage: 0,
	});

	// Messages from Pro (one-off)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

	// 1 invoice: Pro upgrade ($45)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro (recurring only) to Premium (recurring + one-off)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with recurring messages only
 * - Upgrade to Premium (mixed: $50/mo + prepaid words + one-off storage)
 *
 * Expected Result:
 * - Immediate upgrade (Pro → Premium)
 * - Prorated charge: $50 - $20 = $30 + words + storage
 * - Features: 100 words (recurring), 100 storage (one-off)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-recurring-oneoff 2: pro to premium")}`, async () => {
	const customerId = "imm-switch-ro-pro-to-premium";
	const proPrice = 20;
	const premiumPrice = 50;
	const wordsPricePerPack = 15;
	const storagePricePerPack = 10;
	const billingUnits = 100;

	// Pro with recurring messages only
	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [proMessagesItem] });

	// Premium with mixed recurring + one-off
	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});
	const oneOffStorageItem = items.oneOffStorage({
		includedUsage: 0,
		billingUnits,
		price: storagePricePerPack,
	});
	const premium = products.premium({
		id: "premium-mixed",
		items: [monthlyWordsItem, oneOffStorageItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state: Pro only
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id],
	});

	// Calculate expected total (prorated base + prepaid + one-off)
	const wordsQuantity = 100;
	const storageQuantity = 100;
	const proratedBase = premiumPrice - proPrice; // $30
	const expectedTotal = proratedBase + wordsPricePerPack + storagePricePerPack; // $55

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Storage, quantity: storageQuantity },
		],
	});
	expect(preview.total).toBe(expectedTotal);

	// Upgrade to Premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Storage, quantity: storageQuantity },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium active, Pro removed
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Words from Premium (recurring prepaid)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
		usage: 0,
	});

	// Storage from Premium (one-off)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Storage,
		balance: storageQuantity,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + Premium upgrade ($55)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off balance is LOST when upgrading to product without that one-off
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro (mixed: $20/mo + one-off messages with 50 remaining balance)
 * - Upgrade to Premium ($50/mo, recurring only, NO one-off messages)
 *
 * Expected Result:
 * - Immediate upgrade
 * - One-off messages balance (50) is LOST
 * - Premium features available, but old one-off balance gone
 *
 * Why:
 * - One-off items are tied to the product that granted them
 * - When switching to a product without that one-off item, the balance doesn't carry over
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-recurring-oneoff 3: one-off balance lost on upgrade")}`, async () => {
	const customerId = "imm-switch-ro-oneoff-lost";
	const proPrice = 20;
	const premiumPrice = 50;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	// Pro with one-off messages
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});
	const pro = products.pro({
		id: "pro-with-oneoff",
		items: [oneOffMessagesItem],
	});

	// Premium with recurring messages only (NO one-off messages)
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium-recurring-only",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify initial state: Pro with 100 one-off messages
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Use 50 messages
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Verify 50 remaining
	const customerAfterUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterUsage,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 50,
	});

	// Calculate expected total (prorated base only, no one-off options needed)
	const proratedBase = premiumPrice - proPrice; // $30
	const expectedTotal = proratedBase;

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(expectedTotal);

	// Upgrade to Premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium active, Pro removed
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Messages from Premium (500 recurring), one-off balance (50) is LOST
	// New balance is 500 from Premium's monthly messages
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0, // Usage resets on new product
	});

	// 2 invoices: Pro ($20 + $10 one-off) + Premium upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
