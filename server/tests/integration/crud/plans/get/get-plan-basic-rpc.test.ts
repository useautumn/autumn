import { expect, test } from "bun:test";
import { type ApiPlanV1, ApiPlanV1Schema, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const testCase = "get-plan-basic-rpc";
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const messagesItem = items.monthlyMessages({ includedUsage: 100 });
const wordsItem = items.consumableWords({ includedUsage: 10 });
const creditsItem = items.monthlyCredits({ includedUsage: 10 });

const pro = products.pro({
	id: "pro",
	items: [messagesItem, wordsItem, creditsItem],
});

test.concurrent(`${chalk.yellowBright("rpc get: get plan response in latest format")}`, async () => {
	await initScenario({
		setup: [s.products({ list: [pro], prefix: testCase })],
		actions: [],
	});

	const plan = await autumnRpc.plans.get<ApiPlanV1>(pro.id);
	ApiPlanV1Schema.parse(plan);

	const messagesResponseItem = plan.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	const wordsResponseItem = plan.items.find(
		(item) => item.feature_id === TestFeature.Words,
	);
	const creditsResponseItem = plan.items.find(
		(item) => item.feature_id === TestFeature.Credits,
	);

	expect(messagesResponseItem).toBeDefined();
	expect(wordsResponseItem).toBeDefined();
	expect(creditsResponseItem).toBeDefined();
	expect(plan.price).toBeDefined();
});
