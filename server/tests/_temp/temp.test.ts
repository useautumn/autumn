import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 500,
		}),
	],
});

const free = constructProduct({
	type: "free",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 500,
		}),
	],
});

const oneOffCredits = constructRawProduct({
	id: "one_off_credits",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			includedUsage: 0,
			billingUnits: 1,
			price: 0.01,
			isOneOff: true,
		}),
	],
	// trial: true,
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: invoice payment failed for one off credits")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, free, oneOffCredits],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOffCredits.id,
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: 25,
				},
			],
		});
	});
});

// await createReward({
// 	db: ctx.db,
// 	orgId: ctx.org.id,
// 	env: ctx.env,
// 	autumn: autumnV1,
// 	reward,
// 	// productId: pro.id,
// });
