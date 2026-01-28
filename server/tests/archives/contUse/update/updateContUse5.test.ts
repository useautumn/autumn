import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});
export const proAnnual = constructProduct({
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 50,
			includedUsage: 2,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		}),
	],
	type: "pro",
	isAnnual: true,
});

const testCase = "updateContUse5";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing update contUse included usage, prorate now`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, proAnnual],
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
		{
			id: "3",
			name: "entity3",
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

	test("should upgrade to pro annual", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 5,
		});
		return;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proAnnual,
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
});
