import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedProProduct,
	sharedPremiumProduct,
	initDowngradeSharedProducts,
} from "./sharedProducts.js";

const testCase = "downgrade5";
describe(`${chalk.yellowBright(`${testCase}: testing basic downgrade (paid to paid)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		// Explicitly ensure shared products exist
		await initDowngradeSharedProducts();

		const { testClockId: testClockId_ } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId_;
	});

	test("should attach premium", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedPremiumProduct.id,
		});
	});

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedProProduct.id,
		});
	});

	test("should have correct product and entitlements for scheduled pro", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
			ctx,
		});

		const { products: resProducts } = res;

		const resPro = resProducts.find(
			(p: any) =>
				p.id === sharedProProduct.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeDefined();
	});

	test("should attach premium and remove scheduled pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedPremiumProduct.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		const resPro = res.products.find(
			(p: any) =>
				p.id === sharedProProduct.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeUndefined();

		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
			ctx,
		});
	});

	// Advance time 1 month
	test("should attach pro, advance stripe clock and have pro is attached", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedProProduct.id,
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 15,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: sharedProProduct,
			cusRes: res,
		});
	});
});
