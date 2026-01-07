import { expect, test } from "bun:test";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initTestScenario } from "@tests/utils/testInitUtils/initTestScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("custom-plan: update free plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();
	const wordsItem = items.monthlyWords({ includedUsage: 100 });

	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "update-sub-free1",
		products: [free],
		attachProducts: [free.id],
		customerOptions: {
			withTestClock: true,
			attachPm: "success",
		},
	});

	const messagesUsage = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// 1. Test update free plan preview
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem, wordsItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem, wordsItem],
	});

	const customer = await autumnV1.customers.get(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsItem.included_usage,
		balance: wordsItem.included_usage,
		usage: 0,
	});
});
