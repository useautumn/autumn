import {
	AttachBranch,
	BillingInterval,
	LegacyVersion,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "updateEnts4";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 10000,
		}),
	],
	type: "pro",
	isAnnual: true,
});

describe(`${chalk.yellowBright(`${testCase}: Checking price changes don't result in update ents func`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro annual product", async () => {
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

	test("branch should not be same custom ents if base price updated", async () => {
		let customItems = pro.items.filter((item) => !nullish(item.feature_id));

		customItems = [
			...customItems,
			constructPriceItem({
				price: 10,
				interval: BillingInterval.Year,
			}),
		];

		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		expect(preview.branch).toBe(AttachBranch.SameCustom);
	});
});
