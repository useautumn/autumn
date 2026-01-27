import { expect, test } from "bun:test";
import {
	type ApiPlan,
	ApiPlanSchema,
	type ApiPlanV1,
	ApiPlanV1Schema,
	type ApiProduct,
	ApiProductSchema,
	ApiVersion,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

test.concurrent(`${chalk.yellowBright("cross-version-list-products: list products cross version")}`, async () => {
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

	const premium = constructProduct({
		type: "premium",
		items: [
			constructFeatureItem({
				featureId: TestFeature.Credits,
				includedUsage: 50_000,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: "cross-version-list-products",
		setup: [s.products({ list: [free, pro, premium] })],
		actions: [],
	});

	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
	const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });

	try {
		const plans = (await autumnV2_1.products.list()) as { list: ApiPlanV1[] };
		plans.list.map((plan) => ApiPlanV1Schema.parse(plan));

		const plansV2_0 = (await autumnV2_0.products.list()) as {
			list: ApiPlan[];
		};
		plansV2_0.list.map((plan) => ApiPlanSchema.parse(plan));

		const products = (await autumnV1.products.list()) as {
			list: ApiProduct[];
		};
		products.list.map((product) => ApiProductSchema.parse(product));
	} catch (_e) {
		expect(_e).toBe(undefined);
	} finally {
		console.log("Listed plans, products, and plansV2_0 successfully");
	}
});
