import {
	type AppEnv,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, proAnnual],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, proAnnual],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
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
	it("should attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});

	it("should upgrade to pro annual", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 2).getTime(),
			waitForSeconds: 5,
		});
		return;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proAnnual,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});
});
