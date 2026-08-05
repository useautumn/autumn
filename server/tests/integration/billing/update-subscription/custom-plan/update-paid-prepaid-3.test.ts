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
// PAID-TO-PAID: PREPAID FEATURE ITEM UPDATES (SLICE 3 OF 3)
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
// COMBINED CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

// Change all: price, billing units, and included usage
test.concurrent(
	`${chalk.yellowBright("prepaid: change price, billing units, and included usage")}`,
	async () => {
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
		const newPacks = Math.ceil((quantity - newIncludedUsage) / newBillingUnits);
		expect(preview.total).toBe(newPacks * newPrice - oldPacks * oldPrice);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance = quantity - messagesUsed = 200 - 50 = 150
		// Customer's included_usage = quantity = 200
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

// Zero usage, change item config
test.concurrent(
	`${chalk.yellowBright("prepaid: zero usage, change item config")}`,
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// FREE TO PAID: PREPAID ITEM WITH ZERO QUANTITY
// ═══════════════════════════════════════════════════════════════════════════════

// Update from free product to paid with prepaid item, passing 0 quantity
test.concurrent(
	`${chalk.yellowBright("prepaid: free to paid with zero quantity")}`,
	async () => {
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
			// Usage carries over with no floor, so the balance goes negative.
			balance: 0 - messagesUsed,
			usage: messagesUsed,
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
	},
);
