import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "entity-loose2";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: unlimited entity loose entitlement`)}`, () => {
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

		// Create unlimited loose entitlement on entity
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			unlimited: true,
		});
	});

	test("v2: unlimited entity loose entitlement should always be allowed", async () => {
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
		expect(res.balance?.unlimited).toBe(true);
	});

	test("v2: unlimited entity should allow any required_balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			required_balance: 999999,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
	});

	test("v2: customer-level should see merged entity's unlimited balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id
		})) as unknown as CheckResponseV2;

		// Customer should see merged unlimited from entity
		expect(res.balance?.unlimited).toBe(true);
	});
});
