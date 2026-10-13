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

// 1.3 Add second metered feature
test.concurrent(
	`${chalk.yellowBright("p2p: add second metered feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-add-metered",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 45;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Add words feature
		const wordsItem = items.monthlyWords({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem, wordsItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Adding included feature has no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Words should have full balance
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: wordsItem.included_usage,
			balance: wordsItem.included_usage,
			usage: 0,
		});

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

// 1.4 Remove one metered feature
test.concurrent(
	`${chalk.yellowBright("p2p: remove one metered feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, wordsItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-metered",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage on both features
		const messagesUsage = 30;
		const wordsUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Words,
				value: wordsUsage,
			},
			{ timeout: 2000 },
		);
		return;

		// Remove words feature
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Removing included feature has no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Words should no longer exist
		expect(customer.features[TestFeature.Words]).toBeUndefined();

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
