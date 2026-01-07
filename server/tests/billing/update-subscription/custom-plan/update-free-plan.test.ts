import { test } from "bun:test";
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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem, wordsItem],
	});
});

test.concurrent(`${chalk.yellowBright("custom-plan: something else")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();
	const wordsItem = items.monthlyWords({ includedUsage: 100 });

	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initTestScenario({
		customerId: "custom-plan-something-else",
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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, dashboardItem, wordsItem],
	});
});
