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

test.concurrent(
	`${chalk.yellowBright("p2p: shift included usage up")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-shift-inc-up",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		const newConsumableItem = items.consumableMessages({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage,
			usage: messagesUsage,
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

test.concurrent(
	`${chalk.yellowBright("p2p: shift included usage down into overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 200 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-shift-inc-down",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		const newConsumableItem = items.consumableMessages({ includedUsage: 50 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage,
			usage: messagesUsage,
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

test.concurrent(
	`${chalk.yellowBright("p2p: mid-cycle update with pending overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-pending-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage,
			usage: messagesUsage,
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

test.concurrent(
	`${chalk.yellowBright("p2p: update to more included covers overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-cover-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Messages].balance).toBeLessThan(
			0,
		);

		const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		expect(customer.features[TestFeature.Messages].balance).toBeGreaterThan(0);

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
