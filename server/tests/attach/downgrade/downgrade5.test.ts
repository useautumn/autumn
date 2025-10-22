import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "downgrade5";
describe(`${chalk.yellowBright(`${testCase}: testing basic downgrade (paid to paid)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

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
			productId: products.premium.id,
		});
	});

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	test("should have correct product and entitlements for scheduled pro", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});

		const { products: resProducts } = res;

		const resPro = resProducts.find(
			(p: any) =>
				p.id === products.pro.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeDefined();
	});

	test("should attach premium and remove scheduled pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.premium.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		const resPro = res.products.find(
			(p: any) =>
				p.id === products.pro.id && p.status === CusProductStatus.Scheduled,
		);

		expect(resPro).toBeUndefined();

		compareMainProduct({
			sent: products.premium,
			cusRes: res,
		});
	});

	// Advance time 1 month
	test("should attach pro, advance stripe clock and have pro is attached", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
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
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
	});
});
