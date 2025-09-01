import { expect } from "chai";

import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, oneTimeProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import {
	getFixedPriceAmount,
	getUsagePriceTiers,
	timeout,
} from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";

const testCase = "basic10";

describe(`${chalk.yellowBright("basic10: Multi attach, all one off")}`, () => {
	const customerId = testCase;
	const quantity = 1000;
	const options = [
		{
			feature_id: features.metered2.id,
			quantity,
		},
	];
	before(async function () {
		await initCustomer({
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
		});
	});

	it("should attach monthly with one time", async () => {
		const res = await AutumnCli.attach({
			customerId,
			productIds: [
				oneTimeProducts.oneTimeMetered1.id,
				oneTimeProducts.oneTimeMetered2.id,
			],
			options,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(20000);
	});

	it("should have correct main product and entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: oneTimeProducts.oneTimeMetered1,
			cusRes,
		});

		compareMainProduct({
			sent: oneTimeProducts.oneTimeMetered2,
			cusRes,
			optionsList: options,
		});

		const invoices = cusRes.invoices;
		const metered1Amount = getFixedPriceAmount(oneTimeProducts.oneTimeMetered1);
		const metered2Tiers = getUsagePriceTiers({
			product: oneTimeProducts.oneTimeMetered2,
			featureId: features.metered2.id,
		});

		const metered2Amount = metered2Tiers[0].amount;

		const numBillingUnits = new Decimal(options[0].quantity).div(
			oneTimeProducts.oneTimeMetered2.prices[0].config.billing_units,
		);

		const expectedTotal = new Decimal(metered2Amount)
			.mul(numBillingUnits)
			.add(metered1Amount)
			.toNumber();

		expect(invoices[0].total).to.equal(expectedTotal);
	});
});
