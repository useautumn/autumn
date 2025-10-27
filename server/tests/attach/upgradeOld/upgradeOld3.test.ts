import chalk from "chalk";
import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { addDays } from "date-fns";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import type Stripe from "stripe";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import {
	sharedProWithTrialProduct,
	sharedPremiumWithTrialProduct,
} from "./sharedProducts.js";

describe(`${chalk.yellowBright("upgradeOld3: Testing upgrade (trial to trial)")}`, () => {
	const customerId = "upgradeOld3";
	let testClockId: string;
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

		testClockId = testClockId_;
	});

	test("should attach pro with trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedProWithTrialProduct.id,
		});

		console.log(`   ${chalk.greenBright("Attached pro with trial")}`);
	});

	test("should attach premium with trial", async () => {
		const advanceTo = addDays(new Date(), 3).getTime();

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo,
			waitForSeconds: 10,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: sharedPremiumWithTrialProduct.id,
		});
	});

	test("should check product and ents", async () => {
		const res = await autumn.customers.get(customerId);
		expectCustomerV0Correct({
			sent: sharedPremiumWithTrialProduct,
			cusRes: res,
			ctx,
			status: CusProductStatus.Trialing,
		});

		const invoices = res.invoices;

		expect(invoices![0].total).toBe(0);
	});
});
