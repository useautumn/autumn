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
// PAID-TO-PAID: COMBINATION PRICE + FEATURE UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

// 9.1 Increase price + add feature
test.concurrent(
	`${chalk.yellowBright("p2p: increase price + add feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-combo-inc-add",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 60;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Increase price AND add dashboard
		const newPriceItem = items.monthlyPrice({ price: 30 });
		const dashboardItem = items.dashboard();

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem, dashboardItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should charge $10 ($30 - $20), dashboard is free boolean
		expect(preview.total).toBe(10);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage preserved
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Dashboard added
		expect(customer.features[TestFeature.Dashboard]).toBeDefined();

		// Verify invoice matches preview
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

// 9.2 Decrease price + remove feature
test.concurrent(
	`${chalk.yellowBright("p2p: decrease price + remove feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 30 });
		const dashboardItem = items.dashboard();
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem, dashboardItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-combo-dec-remove",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 40;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Decrease price AND remove dashboard
		const newPriceItem = items.monthlyPrice({ price: 20 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should credit $10 ($20 - $30), dashboard is free boolean
		expect(preview.total).toBe(-10);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage preserved
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Dashboard removed
		expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

		// Verify invoice matches preview
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
