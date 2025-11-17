import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV0,
	type LimitedItem,
	ProductItemInterval,
} from "@autumn/shared";
import type { ApiCustomerV1 } from "@shared/api/customers/previousVersions/apiCustomerV1.js";
import chalk from "chalk";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "@tests/utils/genUtils.js";
import { completeCheckoutForm } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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

// One-time add-on product
const oneTimeItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	price: 9,
	billingUnits: 250,
	isOneOff: true,
}) as LimitedItem;

const oneTime = constructRawProduct({
	id: "one_off",
	items: [oneTimeItem],
	isAddOn: true,
});

const testCase = "checkout2";
const customerId = testCase;

describe(`${chalk.yellowBright("checkout2: Testing attach one time add ons (through checkout)")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [proProd, oneTime],
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

	const oneTimeQuantity = 500;
	const oneTimeBillingUnits = oneTimeItem.billing_units;
	const oneTimePurchaseCount = 2;

	test("should attach one time add on twice, force checkout", async () => {
		for (let i = 0; i < 2; i++) {
			const res = await autumnV1.attach({
				customer_id: customerId,
				product_id: oneTime.id,
				force_checkout: true,
			});

			await completeCheckoutForm(
				res.checkout_url,
				oneTimeQuantity / (oneTimeBillingUnits ?? 1),
			);
			await timeout(15000);
		}
	});

	test("should have correct product & entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		// Find the add-on balance for Messages with lifetime interval (one-time purchase)
		const addOnBalance = cusRes.entitlements.find(
			(e: ApiCustomerV1["entitlements"][number]) =>
				e.feature_id === TestFeature.Messages && e.interval === "lifetime",
		);

		const expectedAmt = oneTimeQuantity * oneTimePurchaseCount;

		expect(addOnBalance?.balance).toBe(expectedAmt);

		expect(cusRes.add_ons).toHaveLength(1);
		expect(cusRes.add_ons[0].id).toBe(oneTime.id);
		expect(cusRes.invoices.length).toBe(1 + oneTimePurchaseCount);
	});

	test("should have correct /check result for metered1", async () => {
		const res = (await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
		)) as CheckResponseV0;

		expect(res.allowed).toBe(true);

		// Pro product gives 10 Messages per month
		const proMetered1Amt = 10;
		const addOnBalance = res.balances.find(
			(b: CheckResponseV0["balances"][number]) =>
				b.feature_id === TestFeature.Messages,
		);

		expect(addOnBalance?.balance).toBe(
			proMetered1Amt + oneTimeQuantity * oneTimePurchaseCount,
		);
	});
});
