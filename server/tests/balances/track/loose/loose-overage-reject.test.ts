import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("loose-overage: track more than balance caps at 0")}`, () => {
	const customerId = "loose-overage";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create loose entitlement with 20 messages
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 20,
		});
	});

	test("should cap at 0 when tracking more than balance (no overage charge)", async () => {
		// Track 50 (more than 20 balance) - should cap at 0, not go negative
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Loose entitlements cap at 0 - no negative balance, no overage charge
		expect(res.balance?.current_balance).toBe(0);
		expect(res.balance?.usage).toBe(20); // Only deducted what was available
	});
});
