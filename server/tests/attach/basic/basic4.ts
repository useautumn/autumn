import chalk from "chalk";
import { expect } from "chai";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { createProducts } from "tests/utils/productUtils.js";

let monthlyItem = constructPrepaidItem({
	featureId: features.metered1.id,
	price: 9,
	billingUnits: 250,
});

let monthly = constructRawProduct({
	id: "basic4_monthly",
	items: [monthlyItem],
});

const testCase = "basic4";
describe(`${chalk.yellowBright("basic4: Testing attach monthly add on")}`, () => {
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
			attachPm: "success",
		});

		await createProducts({
			autumn: this.autumnJs,
			db,
			orgId: org.id,
			env,
			products: [monthly],
		});
	});

	it("should attach pro", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
	});

	const monthlyQuantity = 500;

	it("should attach monthly add on", async function () {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.monthlyAddOnMetered1.id,
			forceCheckout: false,
			options: [
				{
					feature_id: features.metered1.id,
					quantity: monthlyQuantity,
				},
			],
		});
	});

	it("should have correct product & entitlements", async function () {
		const cusRes = await AutumnCli.getCustomer(customerId);
		const proMetered1 = products.pro.entitlements.metered1.allowance;

		const monthlyMetered1Balance = cusRes.entitlements.find(
			(e: any) =>
				e.feature_id === features.metered1.id &&
				e.interval ==
					products.monthlyAddOnMetered1.entitlements.metered1.interval,
		);

		expect(monthlyMetered1Balance!.balance).to.equal(
			proMetered1! + monthlyQuantity,
		);

		expect(cusRes.add_ons).to.have.lengthOf(1);
		const monthlyAddOnId = cusRes.add_ons.find(
			(a: any) => a.id === products.monthlyAddOnMetered1.id,
		);

		expect(monthlyAddOnId).to.exist;
		expect(cusRes.invoices.length).to.equal(2);
	});

	it("should have correct /check result for metered1", async function () {
		const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

		const metered1Balance = res!.balances.find(
			(b: any) => b.feature_id === features.metered1.id,
		);

		const proMetered1Amt = products.pro.entitlements.metered1.allowance;
		const monthlyAddOnMetered1Amt = monthlyQuantity;

		expect(metered1Balance!.balance).to.equal(
			proMetered1Amt! + monthlyAddOnMetered1Amt,
		);
	});
});
