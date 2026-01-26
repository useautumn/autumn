import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const free = constructProduct({
	isDefault: true,
	type: "free",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 500,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 5000,
		}),
	],
});

export const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 50_000,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: v2.1 get customer")}`, () => {
	const customerId = testCase;
	const autumnV2_1: AutumnInt = new AutumnInt({ version: ApiVersion.V2_1 });
	const autumnV2_0: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1_2: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [free, pro, premium],
			prefix: testCase,
		});
	});

	test("should get plans", async () => {
		const plans = await autumnV2_1.products.list();
		console.log(plans.list[0]);

		const plansV2_0 = await autumnV2_0.products.list();
		console.log(plansV2_0.list[0]);

		const products = await autumnV1_2.products.list();
		console.log(products.list[0]);
	});
});
