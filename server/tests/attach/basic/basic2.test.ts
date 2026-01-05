import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemInterval } from "@autumn/shared";
import type { ApiCustomerV1 } from "@shared/api/customers/previousVersions/apiCustomerV1.js";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Pro product (matches global products.pro)
const proProd = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

// Monthly add-on product (matches global products.monthlyAddOnMetered1)
// - Prepaid monthly add-on
// - 0 base allowance, customer specifies quantity
const monthlyAddOn = constructRawProduct({
	id: "monthly-add-on-metered-1",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			price: 9,
			billingUnits: 250,
			includedUsage: 0,
		}),
	],
});

const testCase = "basic2";
const customerId = testCase;

describe(`${chalk.yellowBright("basic2: Testing attach monthly add on")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [proProd, monthlyAddOn],
			prefix: testCase,
			customerId,
		});

		// Then create customer with payment method
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: proProd,
			cusRes: res,
		});
	});
	return;

	const monthlyQuantity = 500;

	test("should attach monthly add on", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: monthlyAddOn.id,
			forceCheckout: false,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: monthlyQuantity,
				},
			],
		});
	});

	test("should have correct product & entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		// Pro gives 10 Messages
		const proMetered1 = 10;

		const monthlyMetered1Balance = cusRes.entitlements.find(
			(e: ApiCustomerV1["entitlements"][number]) =>
				e.feature_id === TestFeature.Messages && e.interval === "month",
		);

		expect(monthlyMetered1Balance?.balance).toBe(proMetered1 + monthlyQuantity);

		expect(cusRes.add_ons).toHaveLength(1);
		const monthlyAddOnId = cusRes.add_ons.find(
			(a: any) => a.id === monthlyAddOn.id,
		);

		expect(monthlyAddOnId).toBeDefined();
		expect(cusRes.invoices.length).toBe(2);
	});

	test("should have correct /check result for metered1", async () => {
		const res: any = await AutumnCli.entitled(customerId, TestFeature.Messages);

		const metered1Balance = res!.balances.find(
			(b: any) => b.feature_id === TestFeature.Messages,
		);

		// Pro gives 10, monthly add-on gives monthlyQuantity
		const proMetered1Amt = 10;
		const monthlyAddOnMetered1Amt = monthlyQuantity;

		expect(metered1Balance!.balance).toBe(
			proMetered1Amt + monthlyAddOnMetered1Amt,
		);
	});
});
