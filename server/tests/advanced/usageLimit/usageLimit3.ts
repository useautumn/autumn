import {
	APIVersion,
	type AppEnv,
	ErrCode,
	type LimitedItem,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const messageItem = constructPrepaidItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	billingUnits: 100,
	price: 8,
	usageLimit: 500,
}) as LimitedItem;

export const pro = constructProduct({
	items: [messageItem],
	type: "pro",
});

// const addOnMessages = constructFeatureItem({
//   featureId: TestFeature.Messages,
//   interval: null,
//   includedUsage: 250,
// }) as LimitedItem;

// const messageAddOn = constructProduct({
//   type: "one_off",
//   items: [addOnMessages],
// });

const testCase = "usageLimit3";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for prepaid`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let _testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const _curUnix = Date.now();

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

		_testClockId = testClockId1!;
	});

	it("should attach pro product with quantity exceeding usage limit and get an error", async () => {
		expectAutumnError({
			errCode: ErrCode.InvalidOptions,
			func: async () => {
				return await attachAndExpectCorrect({
					autumn,
					customerId,
					product: pro,
					stripeCli,
					db,
					org,
					env,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				});
			},
		});
	});
	it("should attach pro product and update quantity with quantity exceeding usage limit and get an error", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
		});

		expectAutumnError({
			errCode: ErrCode.InvalidOptions,
			func: async () => {
				return await attachAndExpectCorrect({
					autumn,
					customerId,
					product: pro,
					stripeCli,
					db,
					org,
					env,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 600,
						},
					],
				});
			},
		});
	});
});
