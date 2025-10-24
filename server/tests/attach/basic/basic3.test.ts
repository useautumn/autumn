import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const oneTimeItem = constructPrepaidItem({
	featureId: features.metered1.id,
	price: 9,
	billingUnits: 250,
	isOneOff: true,
});

const oneTime = constructRawProduct({
	id: "basic3_one_off",
	items: [oneTimeItem],
	isAddOn: true,
});

const monthlyItem = constructPrepaidItem({
	featureId: features.metered1.id,
	price: 9,
	billingUnits: 250,
});

const monthly = constructRawProduct({
	id: "basic3_monthly",
	items: [
		constructPrepaidItem({
			featureId: features.metered1.id,
			price: 9,
			billingUnits: 250,
		}),
	],
});

const testCase = "basic3";

describe(`${chalk.yellowBright("basic3: Testing attach one time / monthly add ons")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		await createProducts({
			autumn: autumn,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			products: [oneTime, monthly],
		});
	});

	test("should attach pro", async () => {
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

	const oneTimeQuantity = 500;
	const oneTimeBillingUnits = oneTimeItem.billing_units;
	const oneTimePurchaseCount = 2;

	test("should attach one time add on twice, force checkout", async () => {
		for (let i = 0; i < 2; i++) {
			const res = await autumn.attach({
				customer_id: customerId,
				product_id: oneTime.id,
				force_checkout: true,
			});

			await completeCheckoutForm(
				res.checkout_url,
				oneTimeQuantity / oneTimeBillingUnits!,
			);
			await timeout(15000);
		}
	});

	test("should have correct product & entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		const addOnBalance = cusRes.entitlements.find(
			(e: any) =>
				e.feature_id === features.metered1.id &&
				e.interval ===
					products.oneTimeAddOnMetered1.entitlements.metered1.interval,
		);

		const expectedAmt = oneTimeQuantity * oneTimePurchaseCount;

		expect(addOnBalance!.balance).toBe(expectedAmt);

		expect(cusRes.add_ons).toHaveLength(1);
		expect(cusRes.add_ons[0].id).toBe(oneTime.id);
		expect(cusRes.invoices.length).toBe(1 + oneTimePurchaseCount);
	});

	test("should have correct /check result for metered1", async () => {
		const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

		expect(res!.allowed).toBe(true);

		const proMetered1Amt = products.pro.entitlements.metered1.allowance;
		const addOnBalance = res!.balances.find(
			(b: any) => b.feature_id === features.metered1.id,
		);

		expect(res!.allowed).toBe(true);
		expect(addOnBalance!.balance).toBe(
			proMetered1Amt! + oneTimeQuantity * oneTimePurchaseCount,
		);
	});
});
