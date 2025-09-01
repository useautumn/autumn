import type { Customer } from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

describe(`${chalk.yellowBright(
	"upgradeOld1: Testing upgrade (trial to paid)",
)}`, () => {
	const customerId = "upgradeOld1";
	let testClockId: string;
	let _customer: Customer;
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;
		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomer({
				autumn: this.autumnJs,
				customerId,
				db: this.db,
				org: this.org,
				env: this.env,
				attachPm: "success",
			});

		_customer = customer_;
		testClockId = testClockId_;
	});

	it("should attach pro with trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.proWithTrial.id,
		});
	});

	it("should attach premium", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 3).getTime(),
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: products.premium.id,
		});
	});

	it("should check product, ents and invoices", async () => {
		const res = await autumn.customers.get(customerId);
		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});

		const invoices = await res.invoices;

		assert.equal(
			invoices[0].total,
			products.premium.prices[0].config.amount,
			"Invoice should be for 50.00",
		);
	});
});
