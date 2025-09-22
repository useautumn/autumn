import { CusProductStatus, InvoiceStatus } from "@autumn/shared";
import { expect } from "chai";
import { timeout } from "tests/utils/genUtils.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "tests/utils/init.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { alexProducts } from "./init.js";
import { runEventsAndCheckBalances } from "./utils.js";
import chalk from "chalk";

describe(chalk.yellowBright("Pro entitlements"), () => {
	let customerId = "alex-pro-customer";
	before("initializing customer", async function () {
		await initCustomer({
			customer_data: {
				id: customerId,
				// name: "Alex Pro Customer",
				email: "alex-pro-customer@test.com",
			},
			db: this.db,
			org: this.org,
			env: this.env,
		});
	});

	it("should upgrade to Pro after calling /attach", async function () {
		const res = await AutumnCli.attach({
			customerId,
			productId: alexProducts.pro.id,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(20000);

		const cusRes = await AutumnCli.getCustomer(customerId);
		expect(typeof cusRes.customer.name).to.equal("string");

		compareMainProduct({
			sent: alexProducts.pro,
			cusRes,
			status: CusProductStatus.Trialing,
		});

		// Check invoice is correct
		const invoices = cusRes.invoices;
		expect(invoices.length).to.equal(1);
		expect(invoices[0].total).to.equal(0);
		expect(invoices[0].status).to.equal(InvoiceStatus.Paid);
	});

	it("should run event sending and check balances for each entitlement", async function () {
		await runEventsAndCheckBalances({
			customerId,
			entitlements: Object.values(alexProducts.pro.entitlements),
		});
	});
});
