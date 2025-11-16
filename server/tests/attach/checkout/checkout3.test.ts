import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { completeCheckoutForm } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
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

export const oneOff = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 5,
		}),
	],
	type: "one_off",
	isAddOn: true,
});

const testCase = "checkout3";
describe(`${chalk.yellowBright(`${testCase}: Testing multi attach checkout, pro + one off`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, oneOff],
			prefix: testCase,
		});
	});

	test("should attach pro and one off product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_ids: [pro.id, oneOff.id],
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(10000);

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});
		expectProductAttached({
			customer,
			product: oneOff,
		});

		expectFeaturesCorrect({
			customer,
			product: pro,
		});

		expectFeaturesCorrect({
			customer,
			product: oneOff,
		});
	});
});
