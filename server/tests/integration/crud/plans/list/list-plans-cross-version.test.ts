import { expect, test } from "bun:test";
import {
	type ApiPlan,
	ApiPlanV0Schema,
	type ApiPlanV1,
	ApiPlanV1Schema,
	type ApiProduct,
	ApiProductSchema,
	ApiVersion,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "list-plans-cross-version";

const creditsItem = items.monthlyCredits({ includedUsage: 500 });
const creditsItemPro = items.monthlyCredits({ includedUsage: 5000 });
const creditsItemPremium = items.monthlyCredits({ includedUsage: 50_000 });

const free = products.base({
	id: "free",
	isDefault: true,
	items: [creditsItem],
});

const pro = products.pro({
	id: "pro",
	items: [creditsItemPro],
});

const premium = products.premium({
	id: "premium",
	items: [creditsItemPremium],
});

test.concurrent(`${chalk.yellowBright("list-plans-cross-version: list products cross version")}`, async () => {
	await initScenario({
		setup: [s.products({ list: [free, pro, premium], prefix: testCase })],
		actions: [],
	});

	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });

	// V2.1 - should return ApiPlanV1 schema (items, auto_enable)
	const plansV2_1 = await autumnV2_1.products.list<ApiPlanV1[]>();
	for (const plan of plansV2_1.list) {
		ApiPlanV1Schema.parse(plan);
	}

	// V2.0 - should return ApiPlan schema (features, default)
	const plansV2_0 = await autumnV2_0.products.list<ApiPlan[]>();
	for (const plan of plansV2_0.list) {
		ApiPlanV0Schema.parse(plan);
	}

	// V1.2 - should return ApiProduct schema
	const productsV1 = await autumnV1.products.list<ApiProduct[]>();
	for (const product of productsV1.list) {
		ApiProductSchema.parse(product);
	}

	// Verify we have the expected products
	expect(plansV2_1.list.length).toBeGreaterThanOrEqual(3);
	expect(plansV2_0.list.length).toBeGreaterThanOrEqual(3);
	expect(productsV1.list.length).toBeGreaterThanOrEqual(3);
});
