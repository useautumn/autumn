import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { expect } from "chai";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "tests/utils/genUtils.js";

// UNCOMMENT FROM HERE
const testCase = "basic2";
describe(`${chalk.yellowBright("basic2: Testing attach pro")}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt();
	let db, org, env;

	before(async function () {
		await setupBefore(this);

		db = this.db;
		org = this.org;
		env = this.env;

		await initCustomer({
			autumn: this.autumnJs,
			customerId,
			db,
			org,
			env,
			fingerprint: "test",
		});
	});

	it("should attach pro through checkout", async function () {
		const { checkout_url } = await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});

		await completeCheckoutForm(checkout_url);
		await timeout(12000);
	});

	it("should have correct product & entitlements", async function () {
		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
		expect(res.invoices.length).to.be.greaterThan(0);
	});

	it("should have correct result when calling /check", async function () {
		const proEntitlements = products.pro.entitlements;

		for (const entitlement of Object.values(proEntitlements)) {
			const allowance = entitlement.allowance;

			const res: any = await AutumnCli.entitled(
				customerId,
				entitlement.feature_id!,
			);

			const entBalance = res!.balances.find(
				(b: any) => b.feature_id === entitlement.feature_id,
			);

			try {
				expect(res!.allowed).to.be.true;
				expect(entBalance).to.exist;
				if (entitlement.allowance) {
					expect(entBalance!.balance).to.equal(allowance);
				}
				// console.log(`   - ${entitlement.feature_id} -- Passed`);
			} catch (error) {
				console.group();
				console.group();
				console.log("Looking for: ", entitlement);
				console.log("Received: ", res);
				console.groupEnd();
				console.groupEnd();
				throw error;
			}
		}
	});
});
