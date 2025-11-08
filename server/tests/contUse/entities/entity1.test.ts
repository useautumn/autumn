import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
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

const testCase = "entity1";

// Pro is $20 / month, Seat is $50 / user

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing create / delete entities`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

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
	];

	test("should create entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += 1;

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
					value: 1,
				},
			],
		});
	});

	const entities = [
		{
			id: "2",
			name: "test",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "test2",
			feature_id: TestFeature.Users,
		},
	];

	test("should create 2 entities and have correct invoice", async () => {
		// await advanceTestClock({
		// 	stripeCli: ctx.stripeCli,
		// 	testClockId,
		// 	advanceTo: addWeeks(new Date(), 2).getTime(),
		// 	waitForSeconds: 30,
		// });

		await autumn.entities.create(customerId, entities);
		await timeout(3000);

		usage += entities.length;

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			itemQuantity: usage,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(userItem.price! * entities.length);
	});

	test("should delete 1 entity and have no new invoice", async () => {
		await autumn.entities.delete(customerId, entities[0].id);

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;
		expect(invoices.length).toBe(2);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 1,
			itemQuantity: usage - 1,
		});
	});

	const newEntities = [
		{
			id: "4",
			name: "test3",
			feature_id: TestFeature.Users,
		},
		{
			id: "5",
			name: "test4",
			feature_id: TestFeature.Users,
		},
	];

	test("should create 2 entities and have correct invoice (only pay for 1)", async () => {
		await autumn.entities.create(customerId, newEntities);
		await timeout(3000);
		usage += 1;

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;

		expect(invoices.length).toBe(3);
		expect(invoices[0].total).toBe(userItem.price!);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			itemQuantity: usage,
		});
	});
});
