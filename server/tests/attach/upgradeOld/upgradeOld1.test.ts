import chalk from "chalk";
import { beforeAll, describe, expect, test } from "bun:test";
import { Customer } from "@autumn/shared";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { addDays } from "date-fns";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import type Stripe from "stripe";
import {
	sharedProWithTrialProduct,
	sharedPremiumProduct,
} from "./sharedProducts.js";

describe(`${chalk.yellowBright(
	"upgradeOld1: Testing upgrade (trial to paid)",
)}`, () => {
	const customerId = "upgradeOld1";
	let testClockId: string;
	let customer: Customer;
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
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
		const res = await autumn.customers.get(customerId);
		expectCustomerV0Correct({
			sent: sharedPremiumProduct,
			cusRes: res,
			ctx,
		});

		const invoices = await res.invoices;

		expect(invoices[0].total).toBe(5000);
	});
});
