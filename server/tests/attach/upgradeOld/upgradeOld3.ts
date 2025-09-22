import assert from "assert";
import chalk from "chalk";
import { CusProductStatus } from "@autumn/shared";
import { addDays } from "date-fns";
import { setupBefore } from "tests/before.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { products } from "tests/global.js";
import Stripe from "stripe";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

describe(`${chalk.yellowBright("upgradeOld3: Testing upgrade (trial to trial)")}`, () => {
	const customerId = "upgradeOld3";
	let testClockId: string;
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

		testClockId = testClockId_;
	});

	it("should attach pro with trial", async function () {
		this.timeout(30000);
		await autumn.attach({
			customer_id: customerId,
			product_id: products.proWithTrial.id,
		});

		console.log(`   ${chalk.greenBright("Attached pro with trial")}`);
	});

	it("should attach premium with trial", async function () {
		const advanceTo = addDays(new Date(), 3).getTime();

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo,
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: products.premiumWithTrial.id,
		});
	});

	it("should check product and ents", async function () {
		const res = await autumn.customers.get(customerId);
		compareMainProduct({
			sent: products.premiumWithTrial,
			cusRes: res,
			status: CusProductStatus.Trialing,
		});

		const invoices = res.invoices;

		assert.equal(invoices![0].total, 0, "Invoice should be 0");
	});
});
