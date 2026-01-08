import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectDowngradeCorrect } from "@tests/utils/expectUtils/expectScheduleUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../merged/mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

const testCase = "migrations6";

const wordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 1000,
});

const pro = constructProduct({
	id: "pro",
	items: [wordsItem],
	type: "pro",
	isDefault: false,
});

const premiumWordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 5000,
});

const premium = constructProduct({
	id: "premium",
	items: [premiumWordsItem],
	type: "premium",
	isDefault: false,
});

const updatedPremiumWordsItem = constructArrearItem({
	featureId: TestFeature.Words,
	includedUsage: 10000,
});

describe(`${chalk.yellowBright(`${testCase}: Testing migration for premium v1 -> premium v2 after downgrade to pro`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach premium product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);
		const wordsBalance = customer.features[TestFeature.Words].balance;
		expect(wordsBalance).toBe(5000);
	});

	test("should downgrade to pro", async () => {
		await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: premium,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});

		// Customer should still have premium active (with scheduled pro)
		const customer = await autumn.customers.get(customerId);
		const wordsBalance = customer.features[TestFeature.Words].balance;
		expect(wordsBalance).toBe(5000);
	});

	test("should update premium product to new version", async () => {
		await autumn.products.update(premium.id, {
			items: [updatedPremiumWordsItem],
		});
	});

	test("should migrate premium v1 to premium v2 after downgrade", async () => {
		const wordsUsage = 2000;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await timeout(4000);

		// Verify usage was tracked correctly before migration
		const customerBeforeMigration = await autumn.customers.get(customerId);
		expect(customerBeforeMigration.features[TestFeature.Words].balance).toBe(
			5000 - wordsUsage,
		);

		// Create updated premium with version 2
		const premiumV2 = { ...premium, version: 2 };
		premiumV2.items = [updatedPremiumWordsItem];

		await autumn.migrate({
			from_product_id: premium.id,
			to_product_id: premiumV2.id,
			from_version: premium.version,
			to_version: premiumV2.version,
		});

		await timeout(10000);

		// 1. Check that premium v2 active, pro scheduled
		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premiumV2,
			status: CusProductStatus.Active,
		});
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});

		// After migration, customer should have premium v2 with new included usage
		const wordsBalance = customer.features[TestFeature.Words].balance;
		// New included usage is 10000, minus 2000 used = 8000
		expect(wordsBalance).toBe(10000 - wordsUsage);
	});
});
