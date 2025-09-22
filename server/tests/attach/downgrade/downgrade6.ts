import { Customer } from "@autumn/shared";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import chalk from "chalk";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";

const testCase = "downgrade6";
describe(`${chalk.yellowBright(`${testCase}: testing expire button`)}`, () => {
	let customerId = testCase;
	let testClockId: string;
	let autumn: AutumnInt = new AutumnInt();
	let customer: Customer;

	before(async function () {
		await setupBefore(this);

		const { testClockId: testClockId_, customer: customer_ } =
			await initCustomer({
				customerId,
				db: this.db,
				org: this.org,
				env: this.env,
				autumn: this.autumnJs,
				attachPm: "success",
			});

		customer = customer_;
		testClockId = testClockId_;
	});

	it("should attach premium", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.premium.id,
		});
	});

	it("should expire premium", async function () {
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

	it("should have correct product and entitlements after expiration", async function () {
		const res = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.free,
			cusRes: res,
		});
	});
});
