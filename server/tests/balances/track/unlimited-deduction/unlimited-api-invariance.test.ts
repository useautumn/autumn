import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type CheckResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";

const customerId = "unlim-api-invariance";
const TRACKED = 5;

describe(`${chalk.yellowBright("unlimited-api-invariance: track on unlimited — balances.list clamped, V2_3 surfaces usage")}`, () => {
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			unlimited: true,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: TRACKED,
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));
	});

	test("guard 1: balances.list returns balance 0 (clamped, never the negative counter)", async () => {
		const res = (await autumnV1.balances.list({
			customer_id: customerId,
		})) as {
			balances: Array<{
				balance: number | null;
				entitlement: { feature: { id: string }; allowance_type: string };
			}>;
		};

		const row = res.balances.find(
			(balance) => balance.entitlement.feature.id === TestFeature.Messages,
		);

		expect(row).toBeDefined();
		expect(row?.entitlement.allowance_type).toBe("unlimited");
		expect(row?.balance).toBe(0);
	});

	test("guard 2: V2_3 check response surfaces real usage (allowed, unlimited, usage = tracked)", async () => {
		const res = (await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV3;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
		expect(res.balance?.granted).toBe(0);
		expect(res.balance?.remaining).toBe(0);
		expect(res.balance?.usage).toBe(TRACKED);
	});

	test("guard 3: V2_3 customer feature block surfaces real usage (unlimited, granted/remaining 0)", async () => {
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			granted: 0,
			remaining: 0,
			usage: TRACKED,
		});
	});

	test("feature red: raw customer_entitlements.balance is the negative usage counter", async () => {
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		expect(cusEnt).toBeDefined();
		expect(cusEnt?.balance).toBe(-TRACKED);
	});
});
