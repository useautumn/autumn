import { createStripeCli } from "@/external/stripe/utils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import Stripe from "stripe";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusProductStatus, Customer } from "@autumn/shared";
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { expect } from "chai";

const testCase = "basic6";
describe(`${chalk.yellowBright(
	"basic6: Testing subscription past_due",
)}`, () => {
	const customerId = testCase;
	let stripeCli: Stripe;
	let testClockId: string;
	let customer: Customer;

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;

		const { testClockId: testClockId_, customer: customer_ } =
			await initCustomer({
				customerId,
				db: this.db,
				org: this.org,
				env: this.env,
				autumn: this.autumnJs,
				attachPm: "success",
			});
		testClockId = testClockId_;
		customer = customer_;
	});

	it("should attach pro product and switch to failed payment method", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});

		await attachFailedPaymentMethod({
			stripeCli,
			customer,
		});
	});

	it("should advance to next cycle", async function () {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});
	});

	it("should have pro product in past due status", async function () {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);
		expect(proProduct).to.exist;
		expect(proProduct.status).to.equal(CusProductStatus.PastDue);
	});
});
