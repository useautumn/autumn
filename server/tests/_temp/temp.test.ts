import { beforeAll, describe, it } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2";
import { timeout } from "@/utils/genUtils";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { attachAuthenticatePaymentMethod } from "../../src/external/stripe/stripeCusUtils";
import { CusService } from "../../src/internal/customers/CusService";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 1,
		}),
	],
});

export const addOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Users,
			includedUsage: 0,
			billingUnits: 1,
			price: 10,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: one off credits test")}`, () => {
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
			products: [pro, addOn],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		await timeout(4000);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: addOn.id,
			options: [
				{
					feature_id: TestFeature.Users,
					quantity: 3,
				},
			],
		});

		const customer = await autumnV1.customers.get(customerId);
		console.log("Customer:", customer);
	});
});
