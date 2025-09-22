import chalk from "chalk";
import Stripe from "stripe";

import { CusProductStatus } from "@autumn/shared";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { expect } from "chai";

import { compareMainProduct } from "tests/utils/compare.js";
import { addHours, addMonths } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

import { setupBefore } from "tests/before.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

const testCase = "downgrade5";
describe(`${chalk.yellowBright(`${testCase}: testing basic downgrade (paid to paid)`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt();
	let testClockId: string;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		stripeCli = this.stripeCli;

		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomer({
				customerId,
				db: this.db,
				org: this.org,
				env: this.env,
				attachPm: "success",
				autumn: autumnJs,
			});

		testClockId = testClockId_;
	});

	it("should attach premium", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.premium.id,
		});
	});

	it("should attach pro", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	it("should have correct product and entitlements for scheduled pro", async function () {
		const res = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});

		const { products: resProducts } = res;

		const resPro = resProducts.find(
			(p: any) =>
				p.id === products.pro.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).to.exist;
	});

	it("should attach premium and remove scheduled pro", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.premium.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		const resPro = res.products.find(
			(p: any) =>
				p.id === products.pro.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).to.not.exist;

		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});
	});

	// Advance time 1 month
	it("should attach pro, advance stripe clock and have pro is attached", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 15,
		});

		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
	});
});
