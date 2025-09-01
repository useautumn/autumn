import {
	APIVersion,
	type AppEnv,
	AttachErrCode,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "updateQuantity1";

export const pro = constructProduct({
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Users,
			price: 12,
			billingUnits: 1,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrades with prepaid single use`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	let curUnix = Date.now();
	const _numUsers = 0;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	const proOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 2,
		},
	];

	it("should attach pro product (arrear prorated)", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			options: proOpts,
		});
	});

	it("should throw error if try to attach same options", async () => {
		await expectAutumnError({
			errCode: AttachErrCode.ProductAlreadyAttached,
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: pro.id,
					options: proOpts,
				});
			},
		});
	});

	const updatedOpts = [
		{
			feature_id: TestFeature.Users,
			quantity: 4,
		},
	];

	it("should update quantity to 4 users and have usage stay the same", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});
		await timeout(3000);

		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 30,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			options: updatedOpts,
			usage: [
				{
					featureId: TestFeature.Users,
					value: 2,
				},
			],
			waitForInvoice: 15000,
		});
	});
});
