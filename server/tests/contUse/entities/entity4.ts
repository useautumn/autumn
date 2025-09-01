// Handling per entity features!

import {
	APIVersion,
	type AppEnv,
	CusExpand,
	type LimitedItem,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { useEntityBalanceAndExpect } from "tests/utils/expectUtils/expectContUse/expectEntityUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearProratedItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../../attach/utils.js";

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
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let _testClockId: string;
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
			autumn,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		_testClockId = testClockId1!;
	});

	let usage = 0;
	const firstEntities = [
		{
			id: "1",
			name: "test",
			feature_id: TestFeature.Users,
		},
	];

	it("should create one entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: usage,
				},
			],
		});
	});

	it("should create 3 entities and have correct message balance", async () => {
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

		expect(res.balance).to.equal(
			(perEntityItem.included_usage as number) * usage,
		);

		// @ts-expect-error
		for (const entity of customer.entities) {
			const entRes = await autumn.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entity.id,
			});

			expect(entRes.balance).to.equal(perEntityItem.included_usage);
		}
	});

	return;

	// 1. Use from main balance...
	it("should use from top level balance", async () => {
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

		expect(balance).to.equal(perEntityIncluded * usage - deduction);
	});

	it("should use from entity balance", async () => {
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
	it("should delete one entity and create a new one", async () => {
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

		expect(masterBalanceAfter).to.equal(masterBalanceBefore);

		const { balance: entityBalanceAfter } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: newEntity.id,
		});

		expect(entityBalanceAfter).to.equal(entityBalanceBefore);
	});
});
