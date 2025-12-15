import { beforeAll, describe } from "bun:test";
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
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { CusService } from "../../src/internal/customers/CusService";

const paidAddOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const pro = constructProduct({
	type: "pro",

	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 10,
			billingUnits: 100,
		}),
	],
});
const premium = constructProduct({
	type: "premium",

	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 12,
			billingUnits: 100,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";

	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await CusService.deleteByOrgId({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			// attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		});

		console.log(res);

		// await autumnV1.attach({ customer_id: customerId, product_id: premium.id });
	});
});
