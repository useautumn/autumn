import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic8";

describe(`${chalk.yellowBright("basic8: Testing trial duplicates (same fingerprint)")}`, () => {
	const customerId = testCase;
	const customerId2 = testCase + "2";
	const autumn = new AutumnInt();
	const randFingerprint = Math.random().toString(36).substring(2, 15);

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: randFingerprint },
			attachPm: "success",
			withTestClock: true,
		});

		await initCustomerV3({
			ctx,
			customerId: customerId2,
			customerData: { fingerprint: randFingerprint },
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

	test("should attach pro with trial to second customer and have correct product & invoice (pro with trial, full price)", async () => {
		await autumn.attach({
			customer_id: customerId2,
			product_id: products.proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId2);

		compareMainProduct({
			sent: products.proWithTrial,
			cusRes: customer,
			status: CusProductStatus.Active,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
		expect(invoices[0].total).toBe(10);
	});
});
