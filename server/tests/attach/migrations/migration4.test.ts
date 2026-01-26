import { beforeAll, describe, expect, test } from "bun:test";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { runMigrationTest } from "./runMigrationTest.js";

const wordsItem = constructArrearItem({
	featureId: TestFeature.Words,
});

const pro = constructProduct({
	id: "pro",
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

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		proWithTrial.id = pro.id;

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should update product to new version", async () => {
		proWithTrial.version = 2;
		await autumn.products.update(proWithTrial.id, {
			items: proWithTrial.items,
			free_trial: proWithTrial.free_trial,
		});
	});

	test("should attach track usage and get correct balance", async () => {
		await timeout(3000);
		const wordsUsage = 120000;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await timeout(3000);

		const { stripeSubs, cusProduct } = await runMigrationTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			fromProduct: pro,
			toProduct: proWithTrial,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			usage: [
				{
					featureId: TestFeature.Words,
					value: wordsUsage,
				},
			],
		});

		expect(stripeSubs[0].trial_end).toBe(null);
		expect(cusProduct?.free_trial).toBe(null);
	});
});
