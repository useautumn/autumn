import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("loose-zero: track when balance is zero")}`, () => {
	const customerId = "loose-zero";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create loose entitlement with 10 balance, then use it all
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 10,
		});

		// Use all balance
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));
	});

	test("should have no effect when balance is already zero", async () => {
		// Verify balance is 0
		let res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.current_balance).toBe(0);
		expect(res.balance?.usage).toBe(10);

		// Try to track more - should succeed but have no effect (already at 0)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Still at 0, usage unchanged (capped)
		expect(res.balance?.current_balance).toBe(0);
		expect(res.balance?.usage).toBe(10);
	});
});
