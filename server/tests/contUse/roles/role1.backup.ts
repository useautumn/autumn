// Handling per entity features!

import {
	type AppEnv,
	LegacyVersion,
	type LimitedItem,
	type Organization,
	type ProductItem,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../../attach/utils.js";

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
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

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

	it("should create initial entities, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should have correct check result for admin rights", async () => {
		const { allowed } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.AdminRights,
			entity_id: adminId,
		});

		const entity = await autumn.entities.get(customerId, adminId);

		expect(allowed).to.equal(true);
		expect(entity.features[TestFeature.AdminRights]).exist;

		const { allowed: userAllowed } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.AdminRights,
			entity_id: userId,
		});
		const userEntity = await autumn.entities.get(customerId, userId);

		expect(userAllowed).to.equal(false);
		expect(userEntity.features[TestFeature.AdminRights]).not.exist;
	});

	it("should have correct total balance", async () => {
		const { balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const totalIncluded =
			userMessages.included_usage + adminMessages.included_usage;

		expect(balance).to.equal(totalIncluded);
	});

	it("should have correct per entity balance", async () => {
		const { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: userId,
		});

		const userEntity = await autumn.entities.get(customerId, userId);

		expect(userBalance).to.equal(userMessages.included_usage);
		expect(userEntity.features[TestFeature.Messages].included_usage).to.equal(
			userMessages.included_usage,
		);

		const { balance: adminBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: adminId,
		});

		const adminEntity = await autumn.entities.get(customerId, adminId);

		expect(adminBalance).to.equal(adminMessages.included_usage);
		expect(adminEntity.features[TestFeature.Messages].included_usage).to.equal(
			adminMessages.included_usage,
		);
	});

	const userUsage = Math.random() * 50;
	const expectedUserBalance = new Decimal(userMessages.included_usage)
		.minus(userUsage)
		.toNumber();
	it("should have correct user usage", async () => {
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

		expect(adminBalance).to.equal(adminMessages.included_usage);
		expect(userBalance).to.equal(expectedUserBalance);
	});

	const adminUsage = Math.random() * 50;
	const expectedAdminBalance = new Decimal(adminMessages.included_usage)
		.minus(adminUsage)
		.toNumber();
	it("Should have correct admin usage", async () => {
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

		expect(adminBalance).to.equal(expectedAdminBalance);
		expect(userBalance).to.equal(expectedUserBalance);
	});
});
