import { AutumnCli } from "tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import chalk from "chalk";
import { beforeAll, describe, expect, test } from "bun:test";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { Customer } from "@autumn/shared";
import {
	sharedProGroup1,
	sharedProGroup2,
	sharedPremiumGroup1,
	sharedPremiumGroup2,
} from "./sharedProducts.js";

/* 
FLOW:
1. Attach pro group 1 & pro group 2 at once -> should have both products as main
2. Upgrade pro group 1 -> premium group 1
3. Upgrade pro group 2 -> premium group 2
*/

const testCase = "multiProduct1";
describe(
	chalk.yellowBright(`${testCase}: Testing multi product attach, and upgrade`),
	() => {
		const customerId = testCase;
		let customer: Customer;
		beforeAll(async () => {
			const res = await initCustomerV3({
				ctx,
				customerId,
				customerData: {},
				attachPm: "success",
				withTestClock: true,
			});
			customer = res.customer;
		});

		test("should attach pro group 1 and pro group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productIds: [sharedProGroup1.id, sharedProGroup2.id],
			});

			const cusRes = await AutumnCli.getCustomer(customerId);
			expectCustomerV0Correct({ sent: sharedProGroup1, cusRes, ctx });
			expectCustomerV0Correct({ sent: sharedProGroup2, cusRes, ctx });
		});

		test("should upgrade to premium group 1", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: sharedPremiumGroup1.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			expectCustomerV0Correct({ sent: sharedPremiumGroup1, cusRes, ctx });
		});

		test("should upgrade to premium group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: sharedPremiumGroup2.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			expectCustomerV0Correct({ sent: sharedPremiumGroup2, cusRes, ctx });
		});
	},
);
