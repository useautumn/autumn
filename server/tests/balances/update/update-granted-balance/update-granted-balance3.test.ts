import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiEntityV1,
	ApiVersion,
	type LimitedItem,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const monthlyMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	entityFeatureId: TestFeature.Users,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [monthlyMsges],
});

const entities = [
	{
		id: "update-granted-balance3-user-1",
		name: "User 1",
		feature_id: TestFeature.Users,
	},
	{
		id: "update-granted-balance3-user-2",
		name: "User 2",
		feature_id: TestFeature.Users,
	},
];

const testCase = "update-granted-balance3";

describe(`${chalk.yellowBright("update-granted-balance3: testing update granted balance on entity balances (targetting entity)")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV2.entities.create(customerId, entities);

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should update granted balance to 75 for monthly feature on entity balance, entity 1", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			current_balance: 50,
			granted_balance: 75,
			interval: ResetInterval.Month,
		});

		const entity1 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		const balance = entity1.balances![TestFeature.Messages];

		expect(balance).toMatchObject({
			granted_balance: 75,
			current_balance: 50,
			usage: 25,
			purchased_balance: 0,
		});

		const entity2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		const balance2 = entity2.balances?.[TestFeature.Messages];

		expect(balance2).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			usage: 0,
			purchased_balance: 0,
		});
	});

	test("should update granted to 50 for entity 2", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[1].id,
			current_balance: 25,
			granted_balance: 50,
		});

		const entity2 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[1].id,
		);
		const balance2 = entity2.balances![TestFeature.Messages];

		expect(balance2).toMatchObject({
			granted_balance: 50,
			current_balance: 25,
			usage: 25,
			purchased_balance: 0,
		});

		const entity1 = await autumnV2.entities.get<ApiEntityV1>(
			customerId,
			entities[0].id,
		);
		const balance1 = entity1.balances![TestFeature.Messages];

		expect(balance1).toMatchObject({
			granted_balance: 75,
			current_balance: 50,
			usage: 25,
			purchased_balance: 0,
		});
	});
});
