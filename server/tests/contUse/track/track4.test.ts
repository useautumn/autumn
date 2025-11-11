import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	expectSubQuantityCorrect,
	expectUpcomingItemsCorrect,
} from "tests/utils/expectUtils/expectContUseUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track4";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing set usage for cont use, prorate next cycle`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	let usage = 0;
	test("should attach pro", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should create set usage to 3 and have correct invoice", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 15,
		});

		await autumn.usage({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await timeout(15000);

		usage += 3;

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli: ctx.stripeCli,
			fullCus,
			stripeSubs,
			curUnix,
			expectedNumItems: 1,
			unitPrice: userItem.price!,
			quantity: 2,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
	});

	test("should set usage to 2 and have no new invoice", async () => {
		const newUsage = 2;

		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 15,
		});

		await autumn.usage({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: newUsage,
		});

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage: newUsage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli: ctx.stripeCli,
			fullCus,
			stripeSubs,
			unitPrice: userItem.price!,
			curUnix,
			expectedNumItems: 2,
			quantity: -1,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
	});

	test("should set usage to 4 and have no new invoice", async () => {
		const newUsage = 4;
		await autumn.usage({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: newUsage,
		});

		usage = newUsage;

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli: ctx.stripeCli,
			fullCus,
			stripeSubs,
			unitPrice: userItem.price!,
			curUnix,
			expectedNumItems: 3,
			quantity: 2,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
	});
});
