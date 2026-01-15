import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("loose-unlimited: unlimited loose entitlement")}`, () => {
	const customerId = "loose-unlimited";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create unlimited loose entitlement
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			unlimited: true,
		});
	});

	test("should allow any track amount with unlimited", async () => {
		// Track large amount
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 999999,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
	});
});
