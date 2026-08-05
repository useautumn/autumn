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
// PAID-TO-PAID: PREPAID FEATURE ITEM UPDATES (SLICE 2 OF 3)
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
// INCLUDED USAGE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Add included usage to prepaid feature
test.concurrent(
	`${chalk.yellowBright("prepaid: add included usage")}`,
	async () => {
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
		const includedUsage = 100;
		const newPrepaidItem = items.prepaidMessages({
			includedUsage,
			billingUnits,
			price: pricePerPack,
		});

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newPrepaidItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Adding included usage doesn't change prepaid charge (same packs)
		expect(preview.total).toBe(-10);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance = includedUsage + quantity - messagesUsed = 50 + 200 - 100 = 150
		// Customer's included_usage = item's includedUsage + quantity = 50 + 200 = 250
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
	},
);

// Remove included usage from prepaid feature
test.concurrent(
	`${chalk.yellowBright("prepaid: remove included usage")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Change price and billing units simultaneously
test.concurrent(
	`${chalk.yellowBright("prepaid: change price and billing units")}`,
	async () => {
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
	},
);
