import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { replaceItems } from "@tests/attach/utils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "@tests/utils/expectUtils/expectContUseUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "updateContUse2";

describe(`${chalk.yellowBright(`contUse/update/${testCase}: Testing update cont use, remove included usage`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
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

	let usage = 0;
	const firstEntities = [
		{
			id: "1",
			name: "test",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "test2",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "test3",
			feature_id: TestFeature.Users,
		},
	];

	test("should create entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += 3;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});

	const reduceUsageBy = 1;
	const newItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: (userItem.included_usage as number) - reduceUsageBy,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	test("should update product with reduced included usage", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 1).getTime(),
			waitForSeconds: 5,
		});

		const customItems = replaceItems({
			featureId: TestFeature.Users,
			items: pro.items,
			newItem,
		});

		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(preview.due_today.total);

		// Usage stays the same...
		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 0,
		});
	});
	return;
});
