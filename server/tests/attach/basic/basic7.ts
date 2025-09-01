import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "basic7";

describe(`${chalk.yellowBright("basic7: Testing trial duplicates (same customer)")}`, () => {
	const customerId = testCase;
	const _customerId2 = `${testCase}2`;
	const autumn = new AutumnInt();

	before(async function () {
		await setupBefore(this);
		await initCustomer({
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
			autumn: this.autumnJs,
			attachPm: "success",
		});
	});

	it("should attach pro with trial and have correct product & invoice", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.proWithTrial,
			cusRes: customer,
			status: CusProductStatus.Trialing,
		});

		const invoices = customer.invoices;
		expect(invoices.length).to.equal(1, "Invoice length should be 1");
		expect(invoices[0].total).to.equal(0, "Invoice total should be 0");
	});

	it("should cancel pro with trial", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: products.proWithTrial.id,
			cancel_immediately: true,
		});
		await timeout(5000); // for webhook to be processed
	});

	it("should be able to attach pro with trial again (renewal flow)", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.proWithTrial,
			cusRes: customer,
		});

		const invoices = customer.invoices;
		expect(invoices.length).to.equal(2, "Invoice length should be 1");
		expect(invoices[0].amount).to.equal(
			products.proWithTrial.prices[0].amount,
			"should have paid full amount (trial already used once)",
		);
	});
});
