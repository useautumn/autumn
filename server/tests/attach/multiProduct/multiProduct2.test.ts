import chalk from "chalk";

import type { Stripe } from "stripe";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusProductStatus, Customer } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { checkProductIsScheduled } from "tests/utils/compare.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { searchCusProducts } from "tests/utils/genUtils.js";
import { checkScheduleContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import {
	sharedPremiumGroup1,
	sharedPremiumGroup2,
	sharedStarterGroup1,
	sharedStarterGroup2,
	sharedFreeGroup2,
} from "./sharedProducts.js";

/* 
FLOW:
1. Attach pro group 1 & premium group 2
2. Downgrade to starter group 1
3. Downgrade to starter group 2
4. Change downgrade to pro group 2
*/

const testCase = "multiProduct2";
describe(`${chalk.yellowBright(
	"multiProduct2: premium1->starter1, premium2->starter2, then premium2->pro2, then premium2->free",
)}`, () => {
	const customerId = testCase;
	let customer: Customer;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
		customer = res.customer;
	});

	test("should attach premium group 1 and premium group 2", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productIds: [
				sharedPremiumGroup1.id,
				sharedPremiumGroup2.id,
			],
		});

		const cusRes = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({ sent: sharedPremiumGroup1, cusRes, ctx });
		expectCustomerV0Correct({ sent: sharedPremiumGroup2, cusRes, ctx });
	});

	test("should downgrade to starter group 1 and starter group 2", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedStarterGroup1.id,
		});

		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedStarterGroup2.id,
		});

		// Check starter group 1 scheduled and starter group 2 scheduled
		const cusRes = await AutumnCli.getCustomer(customerId);
		checkProductIsScheduled({
			product: sharedStarterGroup1,
			cusRes,
		});
		checkProductIsScheduled({
			product: sharedStarterGroup2,
			cusRes,
		});

		// Check if scheduled id is the same
		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer.internal_id,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
			],
		});

		// 1. Pro group 1:
		const starter1 = searchCusProducts({
			cusProducts,
			productId: sharedStarterGroup1.id,
		});

		const starter2 = searchCusProducts({
			cusProducts,
			productId: sharedStarterGroup2.id,
		});

		expect(starter1).toBeDefined();
		expect(starter2).toBeDefined();
		expect(starter1?.scheduled_ids![0]).toBe(starter2?.scheduled_ids![0]);

		const stripeSchedule = await stripeCli.subscriptionSchedules.retrieve(
			starter1?.scheduled_ids![0]!,
		);

		// console.log(stripeSchedule);
		checkScheduleContainsProducts({
			db: ctx.db,
			schedule: stripeSchedule,
			productIds: [
				sharedStarterGroup1.id,
				sharedStarterGroup2.id,
			],
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should downgrade to free", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedFreeGroup2.id,
		});

		const cusRes = await AutumnCli.getCustomer(customerId);
		checkProductIsScheduled({
			product: sharedFreeGroup2,
			cusRes,
		});

		const cusProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer.internal_id,
		});

		const starterGroup2 = searchCusProducts({
			cusProducts,
			productId: sharedStarterGroup2.id,
		});

		checkScheduleContainsProducts({
			db: ctx.db,
			scheduleId: starterGroup2?.scheduled_ids![0],
			productIds: [sharedStarterGroup2.id],
			org: ctx.org,
			env: ctx.env,
		});
	});
});
