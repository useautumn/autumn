import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const prepaidUsersItem = constructPrepaidItem({
	featureId: TestFeature.Users,
	billingUnits: 1,
	price: 10,
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

const testCase = "temp";

describe(`${chalk.yellowBright("temp: v2.1 get customer")}`, () => {
	const customerId = testCase;
	const autumnV2_1: AutumnInt = new AutumnInt({ version: ApiVersion.V2_1 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});

		await autumnV2_1.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	test("should get customer", async () => {
		const customer = await autumnV2_1.customers.get(customerId);
		expect(customer).toBeDefined();
		console.log(customer);
	});
});
