import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { BillingInterval, ProductItemInterval, ProductV2 } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { replaceItems } from "../utils.js";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import { defaultApiVersion } from "tests/constants.js";
import { runMigrationTest } from "./runMigrationTest.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

let wordsItem = constructArrearItem({
	featureId: TestFeature.Words,
});

export let pro = constructProduct({
	items: [wordsItem],
	type: "pro",
	isDefault: false,
});

const testCase = "migrations2";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for pro usage product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should attach free product", async () => {
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

	let newPro: ProductV2;
	const increaseWordsBy = 1500;
	test("should update product to new version", async () => {
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

	test("should attach track usage and get correct balance", async () => {
		const wordsUsage = 120000;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
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
			stripeCli: ctx.stripeCli,
			customerId,
			fromProduct: pro,
			toProduct: newPro,
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
	});
});
