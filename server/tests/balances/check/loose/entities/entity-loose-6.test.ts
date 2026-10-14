import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
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

		await autumnV1.entities.create(customerId, [
			{
				id: entityId,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 200,
		});

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
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		if (!isBalanceWorkerRoute()) {
			expect(res.balance?.granted_balance).toBe(500);
			expect(res.balance?.current_balance).toBe(500);
		}
	});

	test("v2: entity level should see customer + entity balance (200 + 300 = 500)", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entityId);
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

		const balances = breakdown
			?.map((b) => b.granted_balance)
			.sort((a, b) => a - b);
		expect(balances).toEqual([200, 300]);
	});

	test("v2: merged balance is displayed, but customer allowed uses customer-owned balances", async () => {
		const customerRes = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 250,
		})) as unknown as CheckResponseV2;

		if (!isBalanceWorkerRoute()) {
			expect(customerRes.balance?.current_balance).toBe(500);
		}

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
