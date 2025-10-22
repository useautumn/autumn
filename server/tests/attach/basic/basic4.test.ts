import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { createProducts } from "tests/utils/productUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const monthlyItem = constructPrepaidItem({
	featureId: features.metered1.id,
	price: 9,
	billingUnits: 250,
});

const monthly = constructRawProduct({
	id: "basic4_monthly",
	items: [monthlyItem],
});

const testCase = "basic4";

describe(`${chalk.yellowBright("basic4: Testing attach monthly add on")}`, () => {
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
			products: [monthly],
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

	const monthlyQuantity = 500;

	test("should attach monthly add on", async () => {
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

	test("should have correct product & entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		const proMetered1 = products.pro.entitlements.metered1.allowance;

		const monthlyMetered1Balance = cusRes.entitlements.find(
			(e: any) =>
				e.feature_id === features.metered1.id &&
				e.interval ===
					products.monthlyAddOnMetered1.entitlements.metered1.interval,
		);

		expect(monthlyMetered1Balance!.balance).toBe(proMetered1! + monthlyQuantity);

		expect(cusRes.add_ons).toHaveLength(1);
		const monthlyAddOnId = cusRes.add_ons.find(
			(a: any) => a.id === products.monthlyAddOnMetered1.id,
		);

		expect(monthlyAddOnId).toBeDefined();
		expect(cusRes.invoices.length).toBe(2);
	});

	test("should have correct /check result for metered1", async () => {
		const res: any = await AutumnCli.entitled(customerId, features.metered1.id);

		const metered1Balance = res!.balances.find(
			(b: any) => b.feature_id === features.metered1.id,
		);

		const proMetered1Amt = products.pro.entitlements.metered1.allowance;
		const monthlyAddOnMetered1Amt = monthlyQuantity;

		expect(metered1Balance!.balance).toBe(
			proMetered1Amt! + monthlyAddOnMetered1Amt,
		);
	});
});
