import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import {
	calcProrationAndExpectInvoice,
	expectSubQuantityCorrect,
} from "@tests/utils/expectUtils/expectContUseUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "entity2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing entities, prorate now`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let curUnix = Date.now();

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
	const firstEntities = [
		{
			id: "1",
			name: "test",
			feature_id: TestFeature.Users,
		},
	];

	test("should create entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += 1;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});

	const newEntities = [
		{
			id: "2",
			name: "test",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "test2",
			feature_id: TestFeature.Users,
		},
	];

	test("should create 2 entities and have correct invoice", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 30,
		});

		await autumn.entities.create(customerId, newEntities);
		usage += newEntities.length;

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			itemQuantity: usage,
		});

		await timeout(5000);

		await calcProrationAndExpectInvoice({
			autumn,
			stripeSubs,
			customerId,
			quantity: newEntities.length,
			unitPrice: userItem.price!,
			curUnix,
			numInvoices: 2,
		});
	});

	test("should delete 1 entity and have correct invoice amount", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 30,
		});

		await timeout(5000);

		await autumn.entities.delete(customerId, newEntities[0].id);
		usage -= 1;

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		await calcProrationAndExpectInvoice({
			autumn,
			stripeSubs,
			customerId,
			quantity: -1,
			unitPrice: userItem.price!,
			curUnix,
			numInvoices: 3,
		});
	});
});
