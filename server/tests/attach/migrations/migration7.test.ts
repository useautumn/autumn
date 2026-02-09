import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
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

const testCase = "migrations7";

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

describe(`${chalk.yellowBright(`${testCase}: Testing migration for premium v1 -> premium v2 after cancellation at cycle end`)}`, () => {
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
			products: [premium],
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

	test("should cancel premium at cycle end", async () => {
		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			cancel_immediately: false,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premium,
			status: CusProductStatus.Active,
			isCanceled: true,
		});
	});

	test("should update premium product to new version", async () => {
		await autumn.products.update(premium.id, {
			items: [updatedPremiumWordsItem],
		});
	});

	test("should migrate premium v1 to premium v2 and preserve cancellation", async () => {
		const premiumV2 = { ...premium, version: 2 };
		premiumV2.items = [updatedPremiumWordsItem];

		await autumn.migrate({
			from_product_id: premium.id,
			to_product_id: premiumV2.id,
			from_version: premium.version,
			to_version: premiumV2.version,
		});

		await timeout(20000);

		// Check that premium v2 is active but still cancelling
		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premiumV2,
			status: CusProductStatus.Active,
			isCanceled: true,
		});

		// Subscription should be cancelled at period end
		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
			shouldBeCanceled: true,
		});

		// Should have updated included usage
		const wordsBalance = customer.features[TestFeature.Words].balance;
		expect(wordsBalance).toBe(10000);
	});
});
