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
