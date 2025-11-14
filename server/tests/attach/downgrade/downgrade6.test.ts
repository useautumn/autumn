import { beforeAll, describe, test } from "bun:test";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedDefaultFree,
	sharedProProduct,
} from "../basic/sharedProducts.js";

const testCase = "downgrade6";
describe(`${chalk.yellowBright(`${testCase}: testing expire button`)}`, () => {
	const customerId = testCase;

	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedProProduct.id,
		});
	});

	test("should expire pro", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: sharedProProduct.id,
			cancel_immediately: true,
		});
	});

	test("should have correct product and entitlements after expiration", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		expectCustomerV0Correct({
			sent: sharedDefaultFree,
			cusRes: res,
		});
	});
});
