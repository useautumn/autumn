import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "entity-loose4";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: entity loose entitlement with reset interval`)}`, () => {
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

		// Create loose entitlement on entity with monthly reset
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			entity_id: entityId,
			granted_balance: 1000,
			reset: {
				interval: ResetInterval.Month,
				interval_count: 1,
			},
		});
	});

	test("v2: entity loose entitlement with reset should include reset info", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entityId);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.feature_id).toBe(TestFeature.Action1);
		expect(res.balance?.granted_balance).toBe(1000);
		expect(res.balance?.current_balance).toBe(1000);

		// Reset info should be present
		expect(res.balance?.reset).toBeDefined();
		expect(res.balance?.reset?.interval).toBe(ResetInterval.Month);
		expect(res.balance?.reset?.resets_at).toBeDefined();
	});
});
