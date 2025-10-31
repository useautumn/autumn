import { beforeAll, describe, expect, test } from "bun:test";
import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	initUpgradeOldSharedProducts,
	sharedPremiumProduct,
	sharedProWithTrialProduct,
} from "./sharedProducts.js";

describe(`${chalk.yellowBright(
	"upgradeOld1: Testing upgrade (trial to paid)",
)}`, () => {
	const customerId = "upgradeOld1";
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;

	const autumn = new AutumnInt({
		secretKey: ctx.orgSecretKey,
	});

	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: "0.1",
	});

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		// Explicitly ensure shared products exist
		await initUpgradeOldSharedProducts();

		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomerV3({
				ctx,
				customerId,
				customerData: {},
				attachPm: "success",
				withTestClock: true,
			});

		customer = customer_;
		testClockId = testClockId_;
	});

	test("should attach pro with trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedProWithTrialProduct.id,
		});
	});

	test("should attach premium", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 3).getTime(),
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: sharedPremiumProduct.id,
		});
	});

	test("should check product, ents and invoices", async () => {
		const res = await autumnV1.customers.get(customerId);
		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
		});

		const invoices = await res.invoices;

		expect(invoices[0].total).toBe(5000);
	});
});
