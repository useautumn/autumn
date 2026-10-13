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
