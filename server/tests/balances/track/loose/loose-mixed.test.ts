import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("loose-mixed: multiple loose ents for same feature")}`, () => {
	const customerId = "loose-mixed";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create first loose entitlement
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
		});

		// Create second loose entitlement for same feature
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 50,
		});
	});

	test("should combine multiple loose ents in balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.granted_balance).toBe(150); // 100 + 50
		expect(res.balance?.current_balance).toBe(150);
	});

	test("should deduct across multiple loose ents", async () => {
		// Track 120 (needs both ents)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.current_balance).toBe(30); // 150 - 120
		expect(res.balance?.usage).toBe(120);
	});
});
