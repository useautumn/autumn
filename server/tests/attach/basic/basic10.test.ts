import { beforeAll, describe, expect, test } from "bun:test";
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
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

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

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});
	});

	test("should attach monthly with one time", async () => {
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

	test("should have correct main product and entitlements", async () => {
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

		expect(invoices[0].total).toBe(expectedTotal);
	});
});
