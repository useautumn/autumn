import { CusProductStatus, type Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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

	it("should attach pro product and switch to failed payment method", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});

		await attachFailedPaymentMethod({
			stripeCli,
			customer,
		});
	});

	it("should advance to next cycle", async () => {
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

	it("should have pro product in past due status", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);
		expect(proProduct).to.exist;
		expect(proProduct.status).to.equal(CusProductStatus.PastDue);
	});
});
