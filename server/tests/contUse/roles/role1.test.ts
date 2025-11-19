// Handling per entity features!

import { beforeAll, describe, expect, test } from "bun:test";
import {
	LegacyVersion,
	type LimitedItem,
	type ProductItem,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const user = TestFeature.Users;
const admin = TestFeature.Admin;

const userMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: user,
}) as LimitedItem;

const adminMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	entityFeatureId: admin,
}) as LimitedItem;

const adminRights = constructFeatureItem({
	featureId: TestFeature.AdminRights,
	entityFeatureId: admin,
	isBoolean: true,
}) as ProductItem;

export const pro = constructProduct({
	items: [userMessages, adminMessages, adminRights],
	type: "pro",
});

const testCase = "role1";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing roles`)}`, () => {
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

	const userId = "user1";
	const adminId = "admin1";
	const firstEntities = [
		{
			id: userId,
			name: "test",
			feature_id: user,
		},
		{
			id: adminId,
			name: "test",
			feature_id: admin,
		},
	];

	test("should create initial entities, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);

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

	test("should have correct check result for admin rights", async () => {
		const { allowed } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.AdminRights,
			entity_id: adminId,
		});

		const entity = await autumn.entities.get(customerId, adminId);

		expect(allowed).toBe(true);
		expect(entity.features[TestFeature.AdminRights]).toBeDefined();

		const { allowed: userAllowed } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.AdminRights,
			entity_id: userId,
		});
		const userEntity = await autumn.entities.get(customerId, userId);

		expect(userAllowed).toBe(false);
		expect(userEntity.features[TestFeature.AdminRights]).toBeUndefined();
	});

	test("should have correct total balance", async () => {
		const { balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const totalIncluded =
			userMessages.included_usage + adminMessages.included_usage;

		expect(balance).toBe(totalIncluded);
	});

	test("should have correct per entity balance", async () => {
		const { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: userId,
		});

		const userEntity = await autumn.entities.get(customerId, userId);

		expect(userBalance).toBe(userMessages.included_usage);
		expect(userEntity.features[TestFeature.Messages].included_usage).toBe(
			userMessages.included_usage,
		);

		const { balance: adminBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: adminId,
		});

		const adminEntity = await autumn.entities.get(customerId, adminId);

		expect(adminBalance).toBe(adminMessages.included_usage);
		expect(adminEntity.features[TestFeature.Messages].included_usage).toBe(
			adminMessages.included_usage,
		);
	});

	const userUsage = Math.random() * 50;
	const expectedUserBalance = new Decimal(userMessages.included_usage)
		.minus(userUsage)
		.toNumber();
	test("should have correct user usage", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: userUsage,
			entity_id: userId,
		});
		await timeout(2000);

		const { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: userId,
		});

		const { balance: adminBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: adminId,
		});

		expect(new Decimal(adminBalance ?? 0).toDP(5).toNumber()).toBe(
			new Decimal(adminMessages.included_usage).toDP(5).toNumber(),
		);
		expect(new Decimal(userBalance ?? 0).toDP(5).toNumber()).toBe(
			new Decimal(expectedUserBalance).toDP(5).toNumber(),
		);
	});

	const adminUsage = Math.random() * 50;
	const expectedAdminBalance = new Decimal(adminMessages.included_usage)
		.minus(adminUsage)
		.toNumber();
	test("Should have correct admin usage", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: adminUsage,
			entity_id: adminId,
		});
		await timeout(2000);

		const { balance: adminBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: adminId,
		});

		const { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: userId,
		});

		expect(new Decimal(adminBalance ?? 0).toDP(5).toNumber()).toBe(
			new Decimal(expectedAdminBalance).toDP(5).toNumber(),
		);
		expect(new Decimal(userBalance ?? 0).toDP(5).toNumber()).toBe(
			new Decimal(expectedUserBalance).toDP(5).toNumber(),
		);
	});
});
