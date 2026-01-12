import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: PREPAID FEATURE ITEM UPDATES
//
// These tests cover custom plan updates to prepaid feature ITEM configuration:
// - Changing price per pack
// - Changing billing units
// - Changing included usage
// - Adding/removing prepaid features
//
// NOTE: Quantity changes are tested in update-quantity/ folder.
//
// Prepaid billing logic on item update:
// 1. Refund previous prepaid: old_packs * old_price
// 2. Charge new prepaid: new_packs * new_price
// 3. preview.total = new_charge - old_refund
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE PER PACK CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Increase price per pack (same quantity)
test.concurrent(`${chalk.yellowBright("prepaid: increase price per pack")}`, async () => {
	const billingUnits = 100;
	const oldPrice = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: oldPrice,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const packs = 3;
	const quantity = packs * billingUnits; // 300 units

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-price-up",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Increase price from $10 to $15 per pack
	const newPrice = 15;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: newPrice,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Refund old: 3 * $10 = $30
	// Charge new: 3 * $15 = $45
	// Total: $45 - $30 = $15
	expect(preview.total).toBe(packs * newPrice - packs * oldPrice);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// For prepaid: customer's included_usage = item's includedUsage + quantity
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Decrease price per pack (same quantity)
test.concurrent(`${chalk.yellowBright("prepaid: decrease price per pack")}`, async () => {
	const billingUnits = 100;
	const oldPrice = 20;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: oldPrice,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const packs = 3;
	const quantity = packs * billingUnits;

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-price-down",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Decrease price from $20 to $10 per pack
	const newPrice = 10;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: newPrice,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Refund old: 3 * $20 = $60
	// Charge new: 3 * $10 = $30
	// Total: $30 - $60 = -$30 (credit)
	expect(preview.total).toBe(packs * newPrice - packs * oldPrice);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING UNITS CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Decrease billing units (same quantity = more packs)
test.concurrent(`${chalk.yellowBright("prepaid: decrease billing units (more packs)")}`, async () => {
	const oldBillingUnits = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: oldBillingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const quantity = 300; // 3 packs of 100

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-billing-units-down",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Decrease billing units from 100 to 50 (300 units = 6 packs now)
	const newBillingUnits = 50;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: newBillingUnits,
		price: pricePerPack,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Old: 300 / 100 = 3 packs * $10 = $30
	// New: 300 / 50 = 6 packs * $10 = $60
	// Total: $60 - $30 = $30
	const oldPacks = Math.ceil(quantity / oldBillingUnits);
	const newPacks = Math.ceil(quantity / newBillingUnits);
	expect(preview.total).toBe(newPacks * pricePerPack - oldPacks * pricePerPack);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Increase billing units (same quantity = fewer packs)
test.concurrent(`${chalk.yellowBright("prepaid: increase billing units (fewer packs)")}`, async () => {
	const oldBillingUnits = 50;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: oldBillingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const quantity = 300; // 6 packs of 50

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-billing-units-up",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Increase billing units from 50 to 100 (300 units = 3 packs now)
	const newBillingUnits = 100;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: newBillingUnits,
		price: pricePerPack,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Old: 300 / 50 = 6 packs * $10 = $60
	// New: 300 / 100 = 3 packs * $10 = $30
	// Total: $30 - $60 = -$30 (credit)
	const oldPacks = Math.ceil(quantity / oldBillingUnits);
	const newPacks = Math.ceil(quantity / newBillingUnits);
	expect(preview.total).toBe(newPacks * pricePerPack - oldPacks * pricePerPack);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// INCLUDED USAGE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Add included usage to prepaid feature
test.concurrent(`${chalk.yellowBright("prepaid: add included usage")}`, async () => {
	const billingUnits = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const packs = 2;
	const quantity = packs * billingUnits; // 200 units

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-add-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Add 50 included usage (free units)
	const includedUsage = 50;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Adding included usage doesn't change prepaid charge (same packs)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = includedUsage + quantity - messagesUsed = 50 + 200 - 100 = 150
	// Customer's included_usage = item's includedUsage + quantity = 50 + 200 = 250
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: includedUsage + quantity,
		balance: includedUsage + quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Remove included usage from prepaid feature
test.concurrent(`${chalk.yellowBright("prepaid: remove included usage")}`, async () => {
	const billingUnits = 100;
	const pricePerPack = 10;
	const oldIncludedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage: oldIncludedUsage,
		billingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const packs = 2;
	const quantity = packs * billingUnits; // 200 units

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-remove-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	// Total balance = 100 (included) + 200 (prepaid) = 300
	const messagesUsed = 150;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Remove included usage
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Removing included usage doesn't change prepaid charge (same packs)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 0 (included) + 200 (prepaid) - 150 (used) = 50
	// Customer's included_usage = 0 + 200 = 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Change price and billing units simultaneously
test.concurrent(`${chalk.yellowBright("prepaid: change price and billing units")}`, async () => {
	const oldBillingUnits = 100;
	const oldPrice = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: oldBillingUnits,
		price: oldPrice,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const quantity = 300; // 3 packs of 100

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-price-and-units",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Change: 100 units @ $10 -> 50 units @ $8
	const newBillingUnits = 50;
	const newPrice = 8;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: newBillingUnits,
		price: newPrice,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Old: 300 / 100 = 3 packs * $10 = $30
	// New: 300 / 50 = 6 packs * $8 = $48
	// Total: $48 - $30 = $18
	const oldPacks = Math.ceil(quantity / oldBillingUnits);
	const newPacks = Math.ceil(quantity / newBillingUnits);
	expect(preview.total).toBe(newPacks * newPrice - oldPacks * oldPrice);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Change all: price, billing units, and included usage
test.concurrent(`${chalk.yellowBright("prepaid: change price, billing units, and included usage")}`, async () => {
	const oldBillingUnits = 100;
	const oldPrice = 10;
	const oldIncludedUsage = 0;

	const prepaidItem = items.prepaidMessages({
		includedUsage: oldIncludedUsage,
		billingUnits: oldBillingUnits,
		price: oldPrice,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const quantity = 200; // 2 packs of 100

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-all-changes",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Change everything: add 100 included, 50 units @ $5
	const newBillingUnits = 50;
	const newPrice = 5;
	const newIncludedUsage = 100;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: newIncludedUsage,
		billingUnits: newBillingUnits,
		price: newPrice,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Old: 200 / 100 = 2 packs * $10 = $20
	// New: 200 / 50 = 4 packs * $5 = $20
	// Total: $20 - $20 = $0
	const oldPacks = Math.ceil(quantity / oldBillingUnits);
	const newPacks = Math.ceil(quantity / newBillingUnits);
	expect(preview.total).toBe(newPacks * newPrice - oldPacks * oldPrice);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = newIncludedUsage + quantity - messagesUsed = 100 + 200 - 50 = 250
	// Customer's included_usage = newIncludedUsage + quantity = 100 + 200 = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newIncludedUsage + quantity,
		balance: newIncludedUsage + quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

// No item changes (just options with same quantity)
test.concurrent(`${chalk.yellowBright("prepaid: no item changes")}`, async () => {
	const billingUnits = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const packs = 3;
	const quantity = packs * billingUnits;

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-no-item-change",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsed = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Same item, same quantity
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No change
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 300 = 300
		balance: quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Zero usage, change item config
test.concurrent(`${chalk.yellowBright("prepaid: zero usage, change item config")}`, async () => {
	const oldBillingUnits = 100;
	const oldPrice = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: oldBillingUnits,
		price: oldPrice,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const quantity = 200;

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "prepaid-zero-usage-item-change",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	// No usage tracked

	// Double the price
	const newPrice = 20;
	const newPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: oldBillingUnits,
		price: newPrice,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newPrepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Old: 2 packs * $10 = $20
	// New: 2 packs * $20 = $40
	// Total: $40 - $20 = $20
	const packs = Math.ceil(quantity / oldBillingUnits);
	expect(preview.total).toBe(packs * newPrice - packs * oldPrice);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity, // 0 + 200 = 200
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE TO PAID: PREPAID ITEM WITH ZERO QUANTITY
// ═══════════════════════════════════════════════════════════════════════════════

// Update from free product to paid with prepaid item, passing 0 quantity
test.concurrent(`${chalk.yellowBright("prepaid: free to paid with zero quantity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem], id: "free" });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "free-to-prepaid-zero-qty",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Track some usage on the free product
	const messagesUsed = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Update to add prepaid messages item with 0 quantity
	const billingUnits = 100;
	const pricePerPack = 10;
	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});
	const priceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// With 0 quantity, no packs are purchased
	// Total = base price only = $20
	expect(preview.total).toBe(priceItem.price);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// With 0 quantity: includedUsage = 0, balance = 0 - messagesUsed (goes negative)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 0, // 0 + 0 = 0
		balance: Math.max(0, 0 - messagesUsed), // 0 - 30 = -30 (negative balance)
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Initial free invoice + update invoice
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
