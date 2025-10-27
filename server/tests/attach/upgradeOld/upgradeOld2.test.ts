import type Stripe from "stripe";
import chalk from "chalk";
import { beforeAll, describe, expect, test } from "bun:test";
import { Customer } from "@autumn/shared";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	sharedProProduct,
	sharedPremiumWithTrialProduct,
} from "./sharedProducts.js";

describe(`${chalk.yellowBright(
	"upgradeOld2: Testing upgrade (paid to trial)",
)}`, () => {
	const customerId = "upgradeOld2";
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

	test("should attach pro", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedProProduct.id,
		});
	});

	test("should attach premium with trial and have trial", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: sharedPremiumWithTrialProduct.id,
		});
	});
});
