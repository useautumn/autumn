import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectSubQuantityCorrect } from "@tests/utils/expectUtils/expectContUseUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getV2Balance } from "../../testBalanceUtils";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track-paid-allocated2";

describe(`${chalk.yellowBright(`${testCase}: Testing track usage for cont use`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let testClockId: string;

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

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	let usage = 0;
	test("should create track +3 usage and have correct invoice", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 30,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await timeout(15000);

		usage += 3;

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(userItem.price! * 2);

		const v2Balance = await getV2Balance({
			customerId,
			featureId: TestFeature.Users,
		});

		expect(v2Balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 2,
			current_balance: 0,
			usage: 3,
		});
	});

	test("should track -3 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -3,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 3,
			itemQuantity: usage - 3,
		});

		const v2Balance = await getV2Balance({
			customerId,
			featureId: TestFeature.Users,
		});

		expect(v2Balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 2,
			current_balance: 3,
			usage: 0,
		});
	});

	test("should track +3 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		const v2Balance = await getV2Balance({
			customerId,
			featureId: TestFeature.Users,
		});

		expect(v2Balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 2,
			current_balance: 0,
			usage: 3,
		});
	});
});
