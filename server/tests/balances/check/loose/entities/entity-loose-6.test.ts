import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "entity-loose6";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: customer loose + entity loose isolation`)}`, () => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create entity
		await autumnV1.entities.create(customerId, [
			{
				id: entityId,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		// Give CUSTOMER a loose balance of 200
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id - this is customer level
			granted_balance: 200,
		});

		// Give ENTITY a loose balance of 300
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			granted_balance: 300,
		});
	});

	test("v2: customer level should see merged balances (200 + 300 = 500)", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		// Customer should see merged: 200 (customer) + 300 (entity) = 500
		expect(res.balance?.granted_balance).toBe(500);
		expect(res.balance?.current_balance).toBe(500);
	});

	test("v2: entity level should see customer + entity balance (200 + 300 = 500)", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entityId);
		// Entity should see combined: 200 (customer) + 300 (entity) = 500
		expect(res.balance?.granted_balance).toBe(500);
		expect(res.balance?.current_balance).toBe(500);
	});

	test("v2: entity breakdown should show both sources", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		const breakdown = res.balance?.breakdown;
		expect(breakdown).toBeDefined();
		expect(breakdown).toHaveLength(2);

		// Both should be loose (plan_id null)
		const balances = breakdown?.map((b) => b.granted_balance).sort((a, b) => a - b);
		expect(balances).toEqual([200, 300]);
	});

	test("v2: both customer and entity can use up to 500 (merged)", async () => {
		// Customer with 250 required should succeed (has 500 merged)
		const customerRes = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 250,
		})) as unknown as CheckResponseV2;

		expect(customerRes.allowed).toBe(true);
		expect(customerRes.balance?.current_balance).toBe(500);

		// Entity with 450 required should succeed
		const entityRes = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			required_balance: 450,
		})) as unknown as CheckResponseV2;

		expect(entityRes.allowed).toBe(true);
		expect(entityRes.balance?.current_balance).toBe(500);
	});
});
