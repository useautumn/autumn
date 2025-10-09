import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "tests/utils/expectUtils/expectScheduleUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "others1";

export const free = constructProduct({
	items: [],
	type: "free",
	isDefault: false,
});

export const pro = constructProduct({
	items: [],
	type: "pro",
	trial: true,
});

export const premium = constructProduct({
	items: [],
	type: "premium",
	trial: true,
});

describe(`${chalk.yellowBright(`${testCase}: Testing trials: pro with trial -> premium with trial -> free`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [free, pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free, pro, premium],
			db,
			orgId: org.id,
			env,
			customerId,
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

	it("should attach pro product (with trial)", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli,
			customerId,
			product: pro,
			db,
			org,
			env,
		});
	});

	it("should attach premium product (with trial)", async () => {
		await attachAndExpectCorrect({
			autumn,
			stripeCli,
			customerId,
			product: premium,
			db,
			org,
			env,
		});
	});

	it("should attach free product at the end of the trial", async () => {
		const { preview } = await expectDowngradeCorrect({
			autumn,
			stripeCli,
			customerId,
			curProduct: premium,
			newProduct: free,
			db,
			org,
			env,
		});
		expectNextCycleCorrect({
			autumn,
			preview,
			stripeCli,
			customerId,
			testClockId,
			product: free,
			db,
			org,
			env,
		});
	});
});
