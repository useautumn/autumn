import { beforeAll, describe, test } from "bun:test";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic9";

describe(`${chalk.yellowBright("basic9: attach monthly with one time prepaid, and quantity = 0")}`, () => {
	const customerId = testCase;

	const options = [
		{
			feature_id: features.metered1.id,
			quantity: 0,
		},
		{
			feature_id: features.metered2.id,
			quantity: 4,
		},
	];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});
	});

	test("should attach monthly with one time", async () => {
		const res = await AutumnCli.attach({
			customerId,
			productId: products.monthlyWithOneTime.id,
			options,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(12000);
	});

	test("should have correct main product and entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.monthlyWithOneTime,
			cusRes,
			optionsList: options,
		});
	});
});
