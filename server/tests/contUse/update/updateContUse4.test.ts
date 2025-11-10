import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { replaceItems } from "tests/attach/utils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { attachNewContUseAndExpectCorrect } from "tests/utils/expectUtils/expectContUse/expectUpdateContUse.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
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

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "updateContUse4";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing update contUse included usage, prorate now`)}`, () => {
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

	const firstEntities = [
		{
			id: "1",
			name: "entity1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "entity2",
			feature_id: TestFeature.Users,
		},
	];

	let usage = 0;
	test("should attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

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

	const extraUsage = 2;
	const newItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: (userItem.included_usage as number) + extraUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	test("should update product with extra included usage", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 15,
		});

		const customItems = replaceItems({
			featureId: TestFeature.Users,
			items: pro.items,
			newItem,
		});

		const { invoices } = await attachNewContUseAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			customItems,
			numInvoices: 2,
		});

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 0,
		});

		// Do own calculation too..
		const sub = stripeSubs[0];
		const amount = -userItem.price!;
		const { start, end } = subToPeriodStartEnd({ sub });
		let proratedAmount = calculateProrationAmount({
			amount,
			periodStart: start * 1000,
			periodEnd: end * 1000,
			now: curUnix,
			allowNegative: true,
		});
		proratedAmount = Number(proratedAmount.toFixed(2));

		expect(invoices[0].total).toBe(proratedAmount);
	});

	const reducedUsage = 3;
	const newItem2 = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: (newItem.included_usage as number) - reducedUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	test("should update product with reduced included usage", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 15,
		});

		const customItems = replaceItems({
			featureId: TestFeature.Users,
			items: pro.items,
			newItem: newItem2,
		});

		const { invoices } = await attachNewContUseAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			customItems,
			numInvoices: 3,
		});

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 0,
		});

		// Do own calculation too..
		const sub = stripeSubs[0];
		const amount = Math.min(reducedUsage, usage) * userItem.price!;
		const { start, end } = subToPeriodStartEnd({ sub });
		let proratedAmount = calculateProrationAmount({
			amount,
			periodStart: start * 1000,
			periodEnd: end * 1000,
			now: curUnix,
			allowNegative: true,
		});
		proratedAmount = Number(proratedAmount.toFixed(2));

		expect(invoices[0].total).toBe(proratedAmount);
	});
});
