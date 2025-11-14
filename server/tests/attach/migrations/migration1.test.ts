import { beforeAll, describe, test } from "bun:test";
import type { LimitedItem, ProductV2 } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { defaultApiVersion } from "@tests/constants.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { replaceItems } from "../utils.js";
import { runMigrationTest } from "./runMigrationTest.js";

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
}) as LimitedItem;

const wordsItem = constructFeatureItem({
	featureId: TestFeature.Words,
	includedUsage: 100,
}) as LimitedItem;

export const free = constructProduct({
	items: [messagesItem, wordsItem],
	type: "free",
	isDefault: false,
});

const testCase = "migrations1";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for free product`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [free],
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
			product: free,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			skipSubCheck: true,
		});
	});

	let newFree: ProductV2;
	const increaseMessagesBy = 100;
	const reduceWordsBy = 50;
	test("should update product to new version", async () => {
		newFree = structuredClone(free);

		let newItems = replaceItems({
			items: free.items,
			featureId: TestFeature.Messages,
			newItem: constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage:
					(messagesItem.included_usage as number) + increaseMessagesBy,
			}),
		});

		newItems = replaceItems({
			items: newItems,
			featureId: TestFeature.Words,
			newItem: constructFeatureItem({
				featureId: TestFeature.Words,
				includedUsage: (wordsItem.included_usage as number) - reduceWordsBy,
			}),
		});

		newFree.items = newItems;

		await autumn.products.update(free.id, {
			items: newItems,
		});
	});

	test("should attach track usage and get correct balance", async () => {
		const wordsUsage = 25;
		const messagesUsage = 20;
		await autumn.track({
			customer_id: customerId,
			value: wordsUsage,
			feature_id: TestFeature.Words,
		});

		await autumn.track({
			customer_id: customerId,
			value: messagesUsage,
			feature_id: TestFeature.Messages,
		});

		await timeout(2000);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(Date.now(), 1).getTime(),
			waitForSeconds: 30,
		});

		let customer = await autumn.customers.get(customerId);

		await autumn.migrate({
			from_product_id: free.id,
			to_product_id: newFree.id,
			from_version: 1,
			to_version: 2,
		});

		await new Promise((resolve) => setTimeout(resolve, 4000));

		// 1. Get features
		customer = await autumn.customers.get(customerId);

		await runMigrationTest({
			autumn,
			stripeCli: ctx.stripeCli,
			customerId,
			fromProduct: free,
			toProduct: newFree,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			usage: [
				{
					featureId: TestFeature.Words,
					value: wordsUsage,
				},
				{
					featureId: TestFeature.Messages,
					value: messagesUsage,
				},
			],
		});
	});
});
