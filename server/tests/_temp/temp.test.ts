import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService";
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

		const res = await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
		});

		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		console.log(fullCustomer);
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
