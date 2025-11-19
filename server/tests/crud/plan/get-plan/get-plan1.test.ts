import { beforeAll, describe, test } from "bun:test";
import { type ApiProduct, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const usageFeature = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 10,
	billingUnits: 1,
	price: 0.5,
});

const prepaidFeature = constructPrepaidItem({
	featureId: TestFeature.Credits,
	billingUnits: 150,
	price: 10,
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,
	items: [messagesFeature, usageFeature, prepaidFeature],
});

const testCase = "get-plan1";

describe(`${chalk.yellowBright("get-plan1: get plan response v1.2")}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	test("should track version 1.2 response", async () => {
		const plan = (await autumnV1.products.get(pro.id)) as ApiProduct;

		// 1. Check messages product item
		const msgesResponseItem = plan.items.find(
			(item) => item.feature_id === TestFeature.Messages,
		);

		console.log(msgesResponseItem);
	});
});
