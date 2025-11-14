import { beforeAll, describe, expect, test } from "bun:test";
import {
	type Customer,
	LegacyVersion,
	type LimitedItem,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const msgesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Month,
	rolloverConfig,
	entityFeatureId: TestFeature.Users,
}) as LimitedItem;

export const free = constructProduct({
	items: [msgesItem],
	type: "free",
	isDefault: false,
});

const testCase = "rollover2";
// , per entity and regular

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item (per entity)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	const entities: any[] = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "Entity 2",
			feature_id: TestFeature.Users,
		},
	];

	test("should attach pro product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		await autumn.entities.create(customerId, entities);
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;
	const newEntity1Balance = 300;
	const newEntity2Balance = 200;
	const includedUsage = msgesItem.included_usage;
	const usages = [
		{
			entityId: entity1Id,
			usage: includedUsage - newEntity1Balance,
			rollover: newEntity1Balance,
		},
		{
			entityId: entity2Id,
			usage: includedUsage - newEntity2Balance,
			rollover: newEntity2Balance,
		},
	];

	test("should create track messages, reset, and have correct rollover", async () => {
		for (const usage of usages) {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: usage.usage,
				entity_id: usage.entityId,
			});
		}

		await timeout(3000);

		// Run reset cusEnt on ...
		await resetAndGetCusEnt({
			db: ctx.db,
			customer,
			productGroup: free.group!,
			featureId: TestFeature.Messages,
		});

		for (const usage of usages) {
			const entity = await autumn.entities.get(customerId, usage.entityId);
			const msgesFeature = entity.features[TestFeature.Messages];
			const expectedRollover = Math.min(usage.rollover, rolloverConfig.max);

			expect(msgesFeature.rollovers.length).toBe(1);
			expect(msgesFeature.balance).toBe(includedUsage + expectedRollover);
			expect(msgesFeature.rollovers[0].balance).toBe(expectedRollover);
		}

		// Verify non-cached entity balances
		await timeout(2000);
		for (const usage of usages) {
			const expectedRollover = Math.min(usage.rollover, rolloverConfig.max);
			const nonCachedEntity = await autumn.entities.get(
				customerId,
				usage.entityId,
				{
					skip_cache: "true",
				},
			);
			const nonCachedMsgesFeature =
				nonCachedEntity.features[TestFeature.Messages];
			expect(nonCachedMsgesFeature.balance).toBe(
				includedUsage + expectedRollover,
			);
			expect(nonCachedMsgesFeature.rollovers[0].balance).toBe(expectedRollover);
		}
	});

	test("should reset again and have correct rollovers", async () => {
		await resetAndGetCusEnt({
			db: ctx.db,
			customer,
			productGroup: free.group!,
			featureId: TestFeature.Messages,
		});

		const entity1 = await autumn.entities.get(customerId, entity1Id);
		const entity1Msges = entity1.features[TestFeature.Messages];
		// 400, 300 -> 400, 100 (max is 500)
		const rollovers = entity1Msges.rollovers;
		expect(rollovers[0].balance).toBe(100);
		expect(rollovers[1].balance).toBe(400);

		const entity2 = await autumn.entities.get(customerId, entity2Id);
		const entity2Msges = entity2.features[TestFeature.Messages];
		// 400, 200 -> 400, 0 (max is 500)
		const rollovers2 = entity2Msges.rollovers;
		expect(rollovers2[0].balance).toBe(100);
		expect(rollovers2[1].balance).toBe(400);

		// Verify non-cached entity balances
		await timeout(2000);
		const nonCachedEntity1 = await autumn.entities.get(customerId, entity1Id, {
			skip_cache: "true",
		});
		const nonCachedEntity1Msges =
			nonCachedEntity1.features[TestFeature.Messages];
		const nonCachedRollovers1 = nonCachedEntity1Msges.rollovers;
		expect(nonCachedRollovers1[0].balance).toBe(100);
		expect(nonCachedRollovers1[1].balance).toBe(400);

		const nonCachedEntity2 = await autumn.entities.get(customerId, entity2Id, {
			skip_cache: "true",
		});
		const nonCachedEntity2Msges =
			nonCachedEntity2.features[TestFeature.Messages];
		const nonCachedRollovers2 = nonCachedEntity2Msges.rollovers;
		expect(nonCachedRollovers2[0].balance).toBe(100);
		expect(nonCachedRollovers2[1].balance).toBe(400);
	});

	test("should track and deduct from oldest rollovers first", async () => {
		for (const entity of entities) {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 150,
				entity_id: entity.id,
			});

			await timeout(2000);
			const entRes = await autumn.entities.get(customerId, entity.id);
			const msgesFeature = entRes.features[TestFeature.Messages];
			const rollovers = msgesFeature.rollovers;
			expect(rollovers[0].balance).toBe(0);
			expect(rollovers[1].balance).toBe(350);
			expect(msgesFeature.balance).toBe(includedUsage + 350);
		}

		// Verify non-cached entity balances
		await timeout(2000);
		for (const entity of entities) {
			const nonCachedEntity = await autumn.entities.get(customerId, entity.id, {
				skip_cache: "true",
			});
			const nonCachedMsgesFeature =
				nonCachedEntity.features[TestFeature.Messages];
			const nonCachedRollovers = nonCachedMsgesFeature.rollovers;
			expect(nonCachedRollovers[0].balance).toBe(0);
			expect(nonCachedRollovers[1].balance).toBe(350);
			expect(nonCachedMsgesFeature.balance).toBe(includedUsage + 350);
		}
	});

	test("should track past rollovers and deduct from original balance", async () => {
		for (const entity of entities) {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 400,
				entity_id: entity.id,
			});
			await timeout(2000);

			const entRes = await autumn.entities.get(customerId, entity.id);
			const msgesFeature = entRes.features[TestFeature.Messages];
			const rollovers = msgesFeature.rollovers;
			expect(rollovers[0].balance).toBe(0);
			expect(rollovers[1].balance).toBe(0);
			expect(msgesFeature.balance).toBe(includedUsage - 50);
		}

		// Verify non-cached entity balances
		await timeout(2000);
		for (const entity of entities) {
			const nonCachedEntity = await autumn.entities.get(customerId, entity.id, {
				skip_cache: "true",
			});
			const nonCachedMsgesFeature =
				nonCachedEntity.features[TestFeature.Messages];
			const nonCachedRollovers = nonCachedMsgesFeature.rollovers;
			expect(nonCachedRollovers[0].balance).toBe(0);
			expect(nonCachedRollovers[1].balance).toBe(0);
			expect(nonCachedMsgesFeature.balance).toBe(includedUsage - 50);
		}
	});
});
