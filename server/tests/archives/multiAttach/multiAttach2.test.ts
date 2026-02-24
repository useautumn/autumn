import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectMultiAttachCorrect } from "@tests/utils/expectUtils/expectMultiAttach.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const growth = constructProduct({
	id: "growth",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 100 }),
	],
	type: "growth",
});

const premium = constructProduct({
	id: "premium",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
	trial: true,
});

const pro = constructProduct({
	id: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 300,
		}),
	],
	type: "pro",
	trial: true,
});

const ops = [
	{
		entityId: "1",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
	{
		entityId: "2",
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Active }],
	},
];

const testCase = "multiAttach2";
describe(`${chalk.yellowBright("multiAttach2: Testing multi attach for trial products and update product quantities mid trial")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, premium, growth],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		testClockId = res.testClockId!;
	});

	test("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: pro.id,
				quantity: 5,
				product: pro,
				status: CusProductStatus.Trialing,
			},
			{
				product_id: premium.id,
				quantity: 3,
				product: premium,
				status: CusProductStatus.Trialing,
			},
			{
				product_id: growth.id,
				quantity: 2,
				product: growth,
				status: CusProductStatus.Trialing,
			},
		];

		await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results: productsList,
			db,
			org,
			env,
		});
	});

	test("should advance clock and update premium & growth while trialing", async () => {
		const newProducts = [
			{
				product_id: premium.id,
				quantity: 1,
			},
			{
				product_id: growth.id,
				quantity: 5,
			},
		];

		const results = [
			{
				product: pro,
				quantity: 5,
				status: CusProductStatus.Trialing,
			},
			{
				product: premium,
				quantity: 1,
				status: CusProductStatus.Trialing,
			},

			{
				product: growth,
				quantity: 5,
				status: CusProductStatus.Trialing,
			},
		];

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 3).getTime(),
		});

		await expectMultiAttachCorrect({
			customerId,
			products: newProducts,
			results,
			db,
			org,
			env,
		});
	});
});
