import {
	type AppEnv,
	BillingInterval,
	type Organization,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { defaultApiVersion } from "tests/constants.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts, replaceItems } from "../utils.js";
import { runMigrationTest } from "./runMigrationTest.js";

const wordsItem = constructArrearItem({
	featureId: TestFeature.Words,
});

export const pro = constructProduct({
	items: [wordsItem],
	type: "pro",
	isDefault: false,
});

const testCase = "migrations2";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for pro usage product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let testClockId: string;
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

		testClockId = testClockId1!;
	});

	it("should attach free product", async () => {
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

	let newPro: ProductV2;
	const increaseWordsBy = 1500;
	it("should update product to new version", async () => {
		newPro = structuredClone(pro);

		let newItems = replaceItems({
			items: pro.items,
			featureId: TestFeature.Words,
			newItem: constructArrearItem({
				featureId: TestFeature.Words,
				includedUsage: (wordsItem.included_usage as number) + increaseWordsBy,
			}),
		});

		newItems = replaceItems({
			items: newItems,
			interval: BillingInterval.Month,
			newItem: {
				price: 50,
				interval: ProductItemInterval.Month,
			},
		});

		newPro.items = newItems;
		await autumn.products.update(pro.id, {
			items: newItems,
		});
	});

	it("should attach track usage and get correct balance", async () => {
		const wordsUsage = 120000;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(Date.now(), 1).getTime(),
		});

		await autumn.migrate({
			from_product_id: pro.id,
			to_product_id: newPro.id,
			from_version: 1,
			to_version: 2,
		});

		await timeout(4000);

		await runMigrationTest({
			autumn,
			stripeCli,
			customerId,
			fromProduct: pro,
			toProduct: newPro,
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
	});
});
