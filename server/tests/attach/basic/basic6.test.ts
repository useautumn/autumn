import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	type Customer,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
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

const testCase = "basic6";
const customerId = testCase;

describe(`${chalk.yellowBright("basic6: Testing subscription past_due")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	let stripeCli: Stripe;
	let testClockId: string;
	let customer: Customer;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [proProd],
			prefix: testCase,
			customerId,
		});

		// Then create customer with payment method
		const result = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
		testClockId = result.testClockId;
		customer = result.customer;
	});

	test("should attach pro product and switch to failed payment method", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});

		await attachFailedPaymentMethod({
			stripeCli,
			customer,
		});
	});

	test("should advance to next cycle", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});
	});

	test("should have pro product in past due status", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === proProd.id,
		);
		expect(proProduct).toBeDefined();
		expect(proProduct.status).toBe(CusProductStatus.PastDue);
	});
});
