import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

function sleepUntil(epochMs: number): Promise<void> {
	const delay = epochMs - Date.now();

	if (delay <= 0) {
		return Promise.resolve();
	}

	return new Promise((resolve) => setTimeout(resolve, delay));
}

describe(`${chalk.yellowBright("loose-expiry: track with expiring loose entitlement")}`, () => {
	const customerId = "loose-expiry-track";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	let expiresAt: number;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		expiresAt = Date.now() + 3000;

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			expires_at: expiresAt,
		});
	});

	test("should deduct from expiring loose entitlement before expiry", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

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

	test("should not allow access after expiry", async () => {
		await sleepUntil(expiresAt + 1000);
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
		expect(res.balance).toBeNull();
	});
});

describe(`${chalk.yellowBright("loose-expiry-mixed: mixed expiring and non-expiring loose ents")}`, () => {
	const customerId = "loose-expiry-mixed";
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	let expiresAt: number;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		expiresAt = Date.now() + 3000;

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			expires_at: expiresAt,
		});

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 50,
		});
	});

	test("should combine expiring and non-expiring loose ents before expiry", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.granted_balance).toBe(150);
		expect(res.balance?.current_balance).toBe(150);
	});

	test("should deduct across mixed loose ents", async () => {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.current_balance).toBe(30);
		expect(res.balance?.usage).toBe(120);
	});

	test("should only have non-expiring balance after expiry", async () => {
		await sleepUntil(expiresAt + 1000);
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance).toBeDefined();
		expect(res.balance?.granted_balance).toBe(50);
	});
});
