import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "entity-loose5";
const customerId = testCase;
const entity1Id = `${testCase}-user-1`;
const entity2Id = `${testCase}-user-2`;

describe(`${chalk.yellowBright(`${testCase}: multiple entities with isolated balances`)}`, () => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create two entities
		await autumnV1.entities.create(customerId, [
			{
				id: entity1Id,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
			{
				id: entity2Id,
				name: "User 2",
				feature_id: TestFeature.Users,
			},
		]);

		// Give entity 1 a balance of 100
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity1Id,
			granted_balance: 100,
		});

		// Give entity 2 a balance of 500
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity2Id,
			granted_balance: 500,
		});
	});

	test("v2: entity 1 should have 100 balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity1Id,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entity1Id);
		expect(res.balance?.granted_balance).toBe(100);
		expect(res.balance?.current_balance).toBe(100);
	});

	test("v2: entity 2 should have 500 balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity2Id,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entity2Id);
		expect(res.balance?.granted_balance).toBe(500);
		expect(res.balance?.current_balance).toBe(500);
	});

	test("v2: entity balances should be isolated (entity1 can't use entity2's balance)", async () => {
		// Entity 1 asking for 200 should fail (only has 100)
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity1Id,
			required_balance: 200,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
		expect(res.balance?.current_balance).toBe(100);
	});

	test("v2: customer level should see merged entity balances", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id
		})) as unknown as CheckResponseV2;

		// Customer should see merged entity balances: 100 + 500 = 600
		expect(res.balance?.current_balance).toBe(600);
	});
});
