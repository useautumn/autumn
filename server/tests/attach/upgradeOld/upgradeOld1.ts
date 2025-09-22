import chalk from "chalk";
import { products } from "tests/global.js";
import { assert } from "chai";
import { Customer } from "@autumn/shared";
import { compareMainProduct } from "tests/utils/compare.js";
import { addDays } from "date-fns";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import Stripe from "stripe";

describe(`${chalk.yellowBright(
	"upgradeOld1: Testing upgrade (trial to paid)",
)}`, () => {
	const customerId = "upgradeOld1";
	let testClockId: string;
	let customer: Customer;
	let autumn: AutumnInt = new AutumnInt();
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

		customer = customer_;
		testClockId = testClockId_;
	});

	it("should attach pro with trial", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.proWithTrial.id,
		});
	});

	it("should attach premium", async function () {
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

	it("should check product, ents and invoices", async function () {
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
