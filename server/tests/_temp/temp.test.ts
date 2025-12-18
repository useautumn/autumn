import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const free = constructProduct({
	type: "free",
	isDefault: false,
	// isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const oneOff = constructProduct({
	type: "one_off",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

// const oneOffCredits = constructRawProduct({
// 	id: "one_off_credits",
// 	items: [
// 		constructPrepaidItem({
// 			featureId: TestFeature.Credits,
// 			billingUnits: 100,
// 			price: 10,
// 			isOneOff: true,
// 			resetUsageWhenEnabled: false,
// 		}),
// 	],
// 	isAddOn: true,
// });

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";

	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		// await CusService.deleteByOrgId({
		// 	db: ctx.db,
		// 	orgId: ctx.org.id,
		// 	env: ctx.env,
		// });

		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [free, pro, oneOff],
			prefix: testCase,
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
		});

		console.log(res);
		// await autumnV1.attach({
		// 	customer_id: customerId,
		// 	product_id: free.id,
		// });
		// await autumnV1.attach({
		// 	customer_id: customerId,
		// 	product_id: pro.id,
		// });
	});
});
