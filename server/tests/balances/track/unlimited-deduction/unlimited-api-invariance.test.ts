import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	type CheckResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";

/**
 * Unlimited-deduction feature: tracking on an unlimited cusEnt should really
 * deduct — raw `customer_entitlements.balance` drifts negative as a usage
 * counter — while the external API contract stays byte-for-byte unchanged.
 *
 * Red (current):  the raw-DB test — track on unlimited short-circuits, so
 *                 `customer_entitlements.balance` stays 0 instead of -5.
 * Green (after):  raw balance is -5 AND all three invariance guards still pass.
 *
 * The three invariance guards are GREEN today and are regression guards for
 * the implementation:
 *   1. GET /balances/list returns balance 0 for an unlimited loose cusEnt.
 *      NOTE: this spreads the raw DB row today, so it goes RED
 *      mid-implementation (leaking -5) until the hard-coded clamp lands in
 *      handleListBalances — that red is the signal to add the clamp, not to
 *      touch this assertion.
 *   2. check still returns allowed + unlimited with the masked (0) balance.
 *   3. the customer object's feature block still reports unlimited with
 *      granted/remaining/usage masked to 0.
 */

const customerId = "unlim-api-invariance";
const TRACKED = 5;

describe(`${chalk.yellowBright("unlimited-api-invariance: track on unlimited keeps API responses unchanged")}`, () => {
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Loose unlimited balance (infinite included usage)
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

		// Wait for the Redis -> Postgres flush to settle
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

	test("guard 2: check response unchanged (allowed, unlimited, masked balance)", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
		expect(res.balance?.granted_balance).toBe(0);
		expect(res.balance?.current_balance).toBe(0);
		expect(res.balance?.usage).toBe(0);
	});

	test("guard 3: customer object's feature block unchanged (unlimited, masked to 0)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomerV5>(customerId);

		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			granted_balance: 0,
			current_balance: 0,
			usage: 0,
		});
	});

	test("feature red: raw customer_entitlements.balance is the negative usage counter", async () => {
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		expect(cusEnt).toBeDefined();
		// RED today: track on unlimited short-circuits and balance stays 0.
		expect(cusEnt?.balance).toBe(-TRACKED);
	});
});
