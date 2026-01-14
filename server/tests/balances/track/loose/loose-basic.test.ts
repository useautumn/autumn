import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("loose-basic: basic track with loose entitlement")}`, () => {
	const customerId = "loose-basic";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create loose entitlement with 100 messages
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
		});
	});

	test("should deduct from loose entitlement", async () => {
		// Track 10 usage
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		// Wait for sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check balance
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.granted_balance).toBe(100);
		expect(res.balance?.current_balance).toBe(90);
		expect(res.balance?.usage).toBe(10);
	});

	test("should list correctly", async () => {
		const res = await autumnV2.customers.listV2({
			search: customerId,
		});

		expect(res.list).toMatchObject([
			expect.objectContaining({
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
				fingerprint: null,
				subscriptions: [],
				scheduled_subscriptions: [],
				balances: {
					[TestFeature.Messages]: expect.objectContaining({
						granted_balance: 100,
						current_balance: 90,
						usage: 10,
					}),
				},
			}),
		]);
	});
});
