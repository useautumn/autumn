import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachAuthenticatePaymentMethod } from "@/external/stripe/stripeCusUtils";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 10,
		}),
	],
});

const oneOffCredits = constructRawProduct({
	id: "one_off_credits",
	// isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Credits,
			includedUsage: 0,
			billingUnits: 1,
			price: 0.01,
			isOneOff: true,
		}),
	],
});

const testCase = "invoice-action-required5";

describe(`${chalk.yellowBright("invoice-action-required5: payment failed for one off, non add-on")}`, () => {
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
			products: [pro, oneOffCredits],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});

		await timeout(1000);

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOffCredits.id,
			options: [
				{
					feature_id: TestFeature.Credits,
					quantity: 2000,
				},
			],
		});
		console.log(res);
	});
});
