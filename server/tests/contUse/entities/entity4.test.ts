// Handling per entity features!

import { beforeAll, describe, expect, test } from "bun:test";
import {
	CusExpand,
	LegacyVersion,
	type LimitedItem,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { useEntityBalanceAndExpect } from "@tests/utils/expectUtils/expectContUse/expectEntityUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
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

const perEntityItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	entityFeatureId: TestFeature.Users,
	includedUsage: 500,
}) as LimitedItem;

export const pro = constructProduct({
	items: [userItem, perEntityItem],
	type: "pro",
});

const testCase = "entity4";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing per entity features`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
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

	let usage = 0;
	const firstEntities = [
		{
			id: "1",
			name: "test",
			feature_id: TestFeature.Users,
		},
	];

	test("should create one entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

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

	test("should create 3 entities and have correct message balance", async () => {
		const newEntities = [
			{
				id: "2",
				name: "test",
				feature_id: TestFeature.Users,
			},
			{
				id: "3",
				name: "test",
				feature_id: TestFeature.Users,
			},
		];

		await autumn.entities.create(customerId, newEntities);
		usage += newEntities.length;

		const customer = await autumn.customers.get(customerId, {
			expand: [CusExpand.Entities],
		});

		const res = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance).toBe((perEntityItem.included_usage as number) * usage);

		// @ts-expect-error
		for (const entity of customer.entities) {
			const entRes = await autumn.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entity.id,
			});

			expect(entRes.balance).toBe(perEntityItem.included_usage);
		}
	});

	// 1. Use from main balance...
	test("should use from top level balance", async () => {
		const deduction = 600;
		const perEntityIncluded = perEntityItem.included_usage as number;

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deduction,
		});
		await timeout(5000);

		const { balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(balance).toBe(perEntityIncluded * usage - deduction);
	});

	test("should use from entity balance", async () => {
		await useEntityBalanceAndExpect({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			entityId: "2",
		});

		await useEntityBalanceAndExpect({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			entityId: "3",
		});
	});

	// Delete one entity and create a new one and master balance should be same
	const deletedEntityId = "2";
	const newEntity = {
		id: "4",
		name: "test",
		feature_id: TestFeature.Users,
	};
	test("should delete one entity and create a new one", async () => {
		const { balance: masterBalanceBefore } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const { balance: entityBalanceBefore } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: deletedEntityId,
		});

		await autumn.entities.delete(customerId, deletedEntityId);
		await autumn.entities.create(customerId, [newEntity]);

		const { balance: masterBalanceAfter } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(masterBalanceAfter).toBe(masterBalanceBefore);

		const { balance: entityBalanceAfter } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: newEntity.id,
		});

		expect(entityBalanceAfter).toBe(entityBalanceBefore);
	});
});
