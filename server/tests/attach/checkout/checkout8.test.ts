import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "@tests/utils/genUtils.js";
import { completeCheckoutForm } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Monthly with one-time prepaid product (matches global products.monthlyWithOneTime)
// Has both monthly and one-time prepaid items
const monthlyWithOneTime = constructProduct({
	type: "pro",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			price: 5,
			billingUnits: 100,
			includedUsage: 0,
			isOneOff: true,
		}),
		constructPrepaidItem({
			featureId: TestFeature.Words,
			price: 10,
			billingUnits: 100,
			includedUsage: 0,
			isOneOff: true,
		}),
	],
});

const testCase = "checkout8";
const customerId = testCase;

describe(`${chalk.yellowBright("checkout8: attach monthly with one time prepaid, and quantity = 0")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	const options = [
		{
			feature_id: TestFeature.Messages,
			quantity: 0,
		},
		{
			feature_id: TestFeature.Words,
			quantity: 4,
		},
	];

	beforeAll(async () => {
		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [monthlyWithOneTime],
			prefix: testCase,
			customerId,
		});

		// Then create customer
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});
	});

	test("should attach monthly with one time", async () => {
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: monthlyWithOneTime.id,
			options,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(12000);
	});

	test("should have correct main product and entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: monthlyWithOneTime,
			cusRes,
			optionsList: options,
		});
	});
});
