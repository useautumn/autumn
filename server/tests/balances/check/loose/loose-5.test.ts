import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "check-loose5";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: loose entitlement on entity`)}`, () => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create entity on the Users feature
		await autumnV1.entities.create(customerId, [
			{
				id: entityId,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		// Give the entity 10 messages (loose entitlement)
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			granted_balance: 10,
		});
	});

	test("entity should have 10 messages balance", async () => {
		const entity = await autumnV1.entities.get(customerId, entityId);

		expect(entity.features![TestFeature.Messages]).toBeDefined();
		expect(entity.features![TestFeature.Messages].balance).toBe(10);
	});

	test("v2 check: entity should have access to messages", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		console.log(res);

		expect(res.allowed).toBe(true);
		expect(res.balance).toBeDefined();
		expect(res.balance?.feature_id).toBe(TestFeature.Messages);
		expect(res.balance?.granted_balance).toBe(10);
		expect(res.balance?.current_balance).toBe(10);
	});
});
