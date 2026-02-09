import { expect, test } from "bun:test";
import { type ApiProduct, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "get-plan-basic";

const messagesItem = items.monthlyMessages({ includedUsage: 100 });
const wordsItem = items.consumableWords({ includedUsage: 10 });
const creditsItem = items.monthlyCredits({ includedUsage: 10 });

const pro = products.pro({
	id: "pro",
	items: [messagesItem, wordsItem, creditsItem],
});

test.concurrent(`${chalk.yellowBright("get-plan-basic: get plan response v1.2")}`, async () => {
	await initScenario({
		setup: [s.products({ list: [pro], prefix: testCase })],
		actions: [],
	});

	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const productV2 = (await autumnV1.products.get(pro.id)) as ApiProduct;

	// Check messages product item
	const messagesResponseItem = productV2.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);

	const wordsResponseItem = productV2.items.find(
		(item) => item.feature_id === TestFeature.Words,
	);

	const creditsResponseItem = productV2.items.find(
		(item) => item.feature_id === TestFeature.Credits,
	);

	const priceItem = productV2.items.find(
		(item) => item.type === ("price" as const),
	);

	expect(messagesResponseItem).toBeDefined();
	expect(wordsResponseItem).toBeDefined();
	expect(creditsResponseItem).toBeDefined();
	expect(priceItem).toBeDefined();
});
