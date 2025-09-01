import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { products } from "tests/global.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

describe(`${chalk.yellowBright(
	"upgradeOld2: Testing upgrade (paid to trial)",
)}`, () => {
	const customerId = "upgradeOld2";
	let _testClockId: string;
	let _customer: Customer;
	const autumn: AutumnInt = new AutumnInt();
	let _stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		_stripeCli = this.stripeCli;
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
		_testClockId = testClockId_;
	});

	it("should attach pro", async function () {
		this.timeout(30000);
		await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});
	});

	it("should attach premium with trial and have trial", async function () {
		this.timeout(30000);

		await autumn.attach({
			customer_id: customerId,
			product_id: products.premiumWithTrial.id,
		});
	});
});
