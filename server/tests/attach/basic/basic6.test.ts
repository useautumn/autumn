import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus, type Customer } from "@autumn/shared";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic6";

describe(`${chalk.yellowBright("basic6: Testing subscription past_due")}`, () => {
	const customerId = testCase;
	let stripeCli: Stripe;
	let testClockId: string;
	let customer: Customer;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

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
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
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
			(p: any) => p.id === products.pro.id,
		);
		expect(proProduct).toBeDefined();
		expect(proProduct.status).toBe(CusProductStatus.PastDue);
	});
});
