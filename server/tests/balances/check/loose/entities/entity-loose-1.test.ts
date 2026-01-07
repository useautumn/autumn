import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "entity-loose1";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: basic entity loose entitlement check`)}`, () => {
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

		// Create loose entitlement on entity
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			granted_balance: 500,
		});
	});

	test("v2: entity loose entitlement should be allowed with plan_id null", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.customer_id).toBe(customerId);
		expect(res.entity_id).toBe(entityId);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.feature_id).toBe(TestFeature.Messages);
		expect(res.balance?.granted_balance).toBe(500);
		expect(res.balance?.current_balance).toBe(500);
		expect(res.balance?.usage).toBe(0);
		expect(res.balance?.unlimited).toBe(false);
	});

	test("v2: should respect required_balance for entity", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			required_balance: 400,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.required_balance).toBe(400);
	});

	test("v2: should return allowed=false for insufficient entity balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			required_balance: 999,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
		expect(res.required_balance).toBe(999);
		expect(res.balance?.current_balance).toBe(500);
	});

	test("v2: customer-level check should see merged entity balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id - checking at customer level
		})) as unknown as CheckResponseV2;

		// Customer should see merged entity balances
		expect(res.balance?.current_balance).toBe(500);
	});
});
