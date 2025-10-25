import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic7";

describe(`${chalk.yellowBright("basic7: Testing trial duplicates (same customer)")}`, () => {
	const customerId = testCase;
	const autumn = new AutumnInt();

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro with trial and have correct product & invoice", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.proWithTrial,
			cusRes: customer,
			status: CusProductStatus.Trialing,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
		expect(invoices[0].total).toBe(0);
	});

	test("should cancel pro with trial", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: products.proWithTrial.id,
			cancel_immediately: true,
		});
		await timeout(5000);
	});

	test("should be able to attach pro with trial again (renewal flow)", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.proWithTrial,
			cusRes: customer,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].amount).toBe(products.proWithTrial.prices[0].amount);
	});
});
