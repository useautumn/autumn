import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckout";
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

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const addOn = constructRawProduct({
	id: "addOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 10,
			isOneOff: true,
		}),
	],
});

const testCase = "checkout7";
describe(`${chalk.yellowBright(`${testCase}: Testing invoice checkout with one off product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, addOn],
			prefix: testCase,
		});
	});

	test("should attach pro product, then add on product via invoice checkout", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const options = [
			{
				quantity: 200,
				feature_id: TestFeature.Messages,
			},
		];

		const res2 = await autumn.checkout({
			customer_id: customerId,
			product_id: addOn.id,
			invoice: true,
			options,
		});

		expect(res2.url).toBeDefined();

		await completeInvoiceCheckout({
			url: res2.url!,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: addOn,
		});

		expectFeaturesCorrect({
			customer,
			product: addOn,
			otherProducts: [pro],
			options,
		});
	});

	// it("should have no URL returned if try to attach add on (with invoice true)", async function () {
	//   const res = await autumn.checkout({
	//     customer_id: customerId,
	//     product_id: addOn.id,
	//     invoice: true,
	//   });

	//   expect(res.url).to.not.exist;
	// });
});
