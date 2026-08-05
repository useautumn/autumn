import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: PREPAID FEATURE ITEM UPDATES (SLICE 1 OF 3)
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
test.concurrent(
	`${chalk.yellowBright("prepaid: increase price per pack")}`,
	async () => {
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
	},
);

// Decrease price per pack (same quantity)
test.concurrent(
	`${chalk.yellowBright("prepaid: decrease price per pack")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING UNITS CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Decrease billing units (same quantity = more packs)
test.concurrent(
	`${chalk.yellowBright("prepaid: decrease billing units (more packs)")}`,
	async () => {
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
		expect(preview.total).toBe(
			newPacks * pricePerPack - oldPacks * pricePerPack,
		);

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
	},
);

// Increase billing units (same quantity = fewer packs)
test.concurrent(
	`${chalk.yellowBright("prepaid: increase billing units (fewer packs)")}`,
	async () => {
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
		expect(preview.total).toBe(
			newPacks * pricePerPack - oldPacks * pricePerPack,
		);

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
	},
);
