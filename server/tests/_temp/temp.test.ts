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
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";
import { expectSubToBeCorrect } from "../merged/mergeUtils/expectSubCorrect";

const prepaidUsersItem = constructPrepaidItem({
	featureId: TestFeature.Users,
	billingUnits: 1,
	price: 10,
});
const addOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [prepaidUsersItem],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp:	 add on")}`, () => {
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
			products: [addOn],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: addOn.id,
			options: [
				{
					feature_id: TestFeature.Users,
					quantity: 10,
				},
			],
		});

		const dashboardItem = constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: addOn.id,
			is_custom: true,
			items: [prepaidUsersItem, dashboardItem],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	});
});
