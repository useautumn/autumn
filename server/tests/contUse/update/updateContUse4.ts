import {
	APIVersion,
	type AppEnv,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { attachNewContUseAndExpectCorrect } from "tests/utils/expectUtils/expectContUse/expectUpdateContUse.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
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

	it("should update product with extra included usage", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
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
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
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

		expect(invoices[0].total).to.equal(
			proratedAmount,
			"invoice is equal to calculated prorated amount",
		);
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

	it("should update product with reduced included usage", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
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
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
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

		expect(invoices[0].total).to.equal(
			proratedAmount,
			"invoice is equal to calculated prorated amount",
		);
	});
});
