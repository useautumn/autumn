import { beforeAll, describe, test } from "bun:test";
import chalk from "chalk";
import { defaultApiVersion } from "tests/constants.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "aentity4";

export const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing attach pro diff entities and testing track / check`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	const newEntities = [
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

	const entity1 = newEntities[0];
	const entity2 = newEntities[1];

	test("should attach pro product to entity 1", async () => {
		await autumn.entities.create(customerId, newEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entityId: entity1.id,
			numSubs: 1,
		});
	});

	test("should attach pro product to entity 2", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entityId: entity2.id,
			numSubs: 2,
		});
	});

	const entity1Usage = Math.random() * 1000000;
	test("should track usage on entity 1", async () => {
		await autumn.track({
			customer_id: customerId,
			entity_id: entity1.id,
			feature_id: TestFeature.Words,
			value: entity1Usage,
		});
		await timeout(3000);

		const entity1Res = await autumn.entities.get(customerId, entity1.id);
		const entity2Res = await autumn.entities.get(customerId, entity2.id);

		expectFeaturesCorrect({
			customer: entity1Res,
			product: pro,
			usage: [
				{
					featureId: TestFeature.Words,
					value: entity1Usage,
				},
			],
		});

		expectFeaturesCorrect({
			customer: entity2Res,
			product: pro,
		});
	});

	const entity2Usage = Math.random() * 1000000;
	test("should track usage on entity 2", async () => {
		await autumn.track({
			customer_id: customerId,
			entity_id: entity2.id,
			feature_id: TestFeature.Words,
			value: entity2Usage,
		});

		const entity1Res = await autumn.entities.get(customerId, entity1.id);
		const entity2Res = await autumn.entities.get(customerId, entity2.id);

		expectFeaturesCorrect({
			customer: entity1Res,
			product: pro,
			usage: [
				{
					featureId: TestFeature.Words,
					value: entity1Usage,
				},
			],
		});

		expectFeaturesCorrect({
			customer: entity2Res,
			product: pro,
			usage: [
				{
					featureId: TestFeature.Words,
					value: entity2Usage,
				},
			],
		});
	});
});
