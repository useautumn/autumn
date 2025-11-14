import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
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

const testCase = "updateContUse1";

describe(`${chalk.yellowBright(`attach/entities/${testCase}: Testing update contUse, add included usage`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let curUnix = new Date().getTime();

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

	const extraUsage = 2;
	const newItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: (userItem.included_usage as number) + extraUsage,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	return;

	test("should update product with extra included usage", async () => {
		const customItems = replaceItems({
			featureId: TestFeature.Users,
			items: pro.items,
			newItem,
		});

		usage += extraUsage;

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: extraUsage,
		});

		// Will have 1 invoice because price is replaced...
	});

	const entities = [
		{
			id: "4",
			name: "test4",
			feature_id: TestFeature.Users,
		},
		{
			id: "5",
			name: "test5",
			feature_id: TestFeature.Users,
		},
	];

	test("should create 2 entities and have no invoice", async () => {
		curUnix = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 10,
		});

		await autumn.entities.create(customerId, entities);

		// Usage won't change since using replaceables...
		// usage += entities.length;

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

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
	});
});
