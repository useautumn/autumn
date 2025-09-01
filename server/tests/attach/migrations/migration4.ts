import type { AppEnv, Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { defaultApiVersion } from "tests/constants.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";
import { runMigrationTest } from "./runMigrationTest.js";

const wordsItem = constructArrearItem({
	featureId: TestFeature.Words,
});

export const pro = constructProduct({
	items: [wordsItem],
	type: "pro",
	isDefault: false,
});

const newWordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 120100,
});

const proWithTrial = constructProduct({
	items: [newWordsItem],
	type: "pro",
	isDefault: false,
	trial: true,
});

const testCase = "migrations4";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for pro -> pro with trial (should not start trial)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
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
			products: [pro, proWithTrial],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro],
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

		_testClockId = testClockId1!;
	});

	it("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should update product to new version", async () => {
		proWithTrial.version = 2;
		await autumn.products.update(pro.id, {
			items: proWithTrial.items,
			free_trial: proWithTrial.free_trial,
		});
	});

	it("should attach track usage and get correct balance", async () => {
		const wordsUsage = 120000;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await timeout(4000);

		const { stripeSubs, cusProduct } = await runMigrationTest({
			autumn,
			stripeCli,
			customerId,
			fromProduct: pro,
			toProduct: proWithTrial,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Words,
					value: wordsUsage,
				},
			],
		});

		expect(stripeSubs[0].trial_end).to.equal(null);
		expect(cusProduct?.free_trial).to.equal(null);
	});
});
