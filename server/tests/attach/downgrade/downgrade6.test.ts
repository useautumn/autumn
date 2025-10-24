import { beforeAll, describe, test } from "bun:test";
import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "downgrade6";
describe(`${chalk.yellowBright(`${testCase}: testing expire button`)}`, () => {
	const customerId = testCase;
	let testClockId: string;
	const autumn: AutumnInt = new AutumnInt();
	let customer: Customer;

	beforeAll(async () => {
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
			product_id: products.premium.id,
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
			product_id: products.premium.id,
			cancel_immediately: true,
		});
	});

	test("should have correct product and entitlements after expiration", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.free,
			cusRes: res,
		});
	});
});
