import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic2";

describe(`${chalk.yellowBright("basic2: Testing attach pro")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: true,
		});
	});

	test("should attach pro through checkout", async () => {
		const { checkout_url } = await autumn.attach({
			customer_id: customerId,
			product_id: products.pro.id,
		});

		await completeCheckoutForm(checkout_url);
		await timeout(12000);
	});

	test("should have correct product & entitlements", async () => {
		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: res,
		});
		expect(res.invoices.length).toBeGreaterThan(0);
	});

	test("should have correct result when calling /check", async () => {
		const proEntitlements = products.pro.entitlements;

		for (const entitlement of Object.values(proEntitlements)) {
			const allowance = entitlement.allowance;

			const res: any = await AutumnCli.entitled(
				customerId,
				entitlement.feature_id!,
			);

			const entBalance = res!.balances.find(
				(b: any) => b.feature_id === entitlement.feature_id,
			);

			try {
				expect(res!.allowed).toBe(true);
				expect(entBalance).toBeDefined();
				if (entitlement.allowance) {
					expect(entBalance!.balance).toBe(allowance);
				}
			} catch (error) {
				console.group();
				console.group();
				console.log("Looking for: ", entitlement);
				console.log("Received: ", res);
				console.groupEnd();
				console.groupEnd();
				throw error;
			}
		}
	});
});
