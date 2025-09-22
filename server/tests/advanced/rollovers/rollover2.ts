import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import {
	APIVersion,
	AppEnv,
	Customer,
	LimitedItem,
	Organization,
	ProductItemInterval,
	RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { resetCustomerEntitlement } from "@/cron/cronUtils.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

let rolloverConfig = { max: 500, length: 1, duration: RolloverDuration.Month };

const msgesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Month,
	rolloverConfig,
	entityFeatureId: TestFeature.Users,
}) as LimitedItem;

export let free = constructProduct({
	items: [msgesItem],
	type: "free",
	isDefault: false,
});

const testCase = "rollover2";
// , per entity and regular

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item (per entity)`)}`, () => {
	let customerId = testCase;
	let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
	let stripeCli: Stripe;

	let curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const res = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
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

	it("should attach pro product", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		await autumn.entities.create(customerId, entities);
	});

	let entity1Id = entities[0].id;
	let entity2Id = entities[1].id;
	let newEntity1Balance = 300;
	let newEntity2Balance = 200;
	let includedUsage = msgesItem.included_usage;
	let usages = [
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

	it("should create track messages, reset, and have correct rollover", async function () {
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
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		for (const usage of usages) {
			let entity = await autumn.entities.get(customerId, usage.entityId);
			let msgesFeature = entity.features[TestFeature.Messages];
			let expectedRollover = Math.min(usage.rollover, rolloverConfig.max);

			expect(msgesFeature.rollovers.length).to.equal(1);
			expect(msgesFeature.balance).to.equal(includedUsage + expectedRollover);
			expect(msgesFeature.rollovers[0].balance).to.equal(expectedRollover);
		}
	});

	it("should reset again and have correct rollovers", async function () {
		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group,
			featureId: TestFeature.Messages,
		});

		let entity1 = await autumn.entities.get(customerId, entity1Id);
		let entity1Msges = entity1.features[TestFeature.Messages];
		// 400, 300 -> 400, 100 (max is 500)
		let rollovers = entity1Msges.rollovers;
		expect(rollovers[0].balance).to.equal(100);
		expect(rollovers[1].balance).to.equal(400);

		let entity2 = await autumn.entities.get(customerId, entity2Id);
		let entity2Msges = entity2.features[TestFeature.Messages];
		// 400, 200 -> 400, 0 (max is 500)
		let rollovers2 = entity2Msges.rollovers;
		expect(rollovers2[0].balance).to.equal(100);
		expect(rollovers2[1].balance).to.equal(400);
	});

	it("should track and deduct from oldest rollovers first", async function () {
		for (const entity of entities) {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 150,
				entity_id: entity.id,
			});

			await timeout(2000);
			let entRes = await autumn.entities.get(customerId, entity.id);
			let msgesFeature = entRes.features[TestFeature.Messages];
			let rollovers = msgesFeature.rollovers;
			expect(rollovers[0].balance).to.equal(0);
			expect(rollovers[1].balance).to.equal(350);
			expect(msgesFeature.balance).to.equal(includedUsage + 350);
		}
	});

	it("should track past rollovers and deduct from original balance", async function () {
		for (const entity of entities) {
			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 400,
				entity_id: entity.id,
			});
			await timeout(2000);

			let entRes = await autumn.entities.get(customerId, entity.id);
			let msgesFeature = entRes.features[TestFeature.Messages];
			let rollovers = msgesFeature.rollovers;
			expect(rollovers[0].balance).to.equal(0);
			expect(rollovers[1].balance).to.equal(0);
			expect(msgesFeature.balance).to.equal(includedUsage - 50);
		}
	});
});
