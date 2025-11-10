import { beforeAll, describe, test } from "bun:test";
import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedFreeProduct,
	sharedPremiumProduct,
	initDowngradeSharedProducts,
} from "./sharedProducts.js";

const testCase = "downgrade6";
describe(`${chalk.yellowBright(`${testCase}: testing expire button`)}`, () => {
	const customerId = testCase;
	let testClockId: string;
	const autumn: AutumnInt = new AutumnInt();
	let customer: Customer;

	beforeAll(async () => {
		// Explicitly ensure shared products exist
		await initDowngradeSharedProducts();

		const { testClockId: testClockId_, customer: customer_ } =
			await initCustomerV3({
				ctx,
				customerId,
				customerData: {},
				attachPm: "success",
				withTestClock: true,
			});

		customer = customer_;
		testClockId = testClockId_;
	});

	test("should attach premium", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedPremiumProduct.id,
		});
	});

	test("should expire premium", async () => {
		// const cusProduct = await getMainCusProduct({
		//   db: this.db,
		//   internalCustomerId: customer.internal_id,
		// });

		// await AutumnCli.expire(cusProduct!.id);
		await autumn.cancel({
			customer_id: customerId,
			product_id: sharedPremiumProduct.id,
			cancel_immediately: true,
		});
	});

	test("should have correct product and entitlements after expiration", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		expectCustomerV0Correct({
			sent: sharedFreeProduct,
			cusRes: res,
		});
	});
});
