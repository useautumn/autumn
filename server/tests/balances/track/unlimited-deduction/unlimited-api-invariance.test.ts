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

/**
 * Unlimited-deduction feature: tracking on an unlimited cusEnt really
 * deducts — raw `customer_entitlements.balance` drifts negative as a usage
 * counter — and the LATEST API version (V2_3) surfaces that counter as real
 * usage: `usage = -(raw balance)` while `granted`/`remaining` stay 0 and
 * `unlimited: true`. GET /balances/list stays clamped to 0, and older API
 * versions stay fully masked.
 *
 * Red (current):  the raw-DB test — track on unlimited short-circuits, so
 *                 `customer_entitlements.balance` stays 0 instead of -5 —
 *                 and guards 2/3 — V2_3 still masks usage to 0 instead of 5.
 * Green (after):  raw balance is -5 AND all three guards pass.
 *
 * The three API guards:
 *   1. GET /balances/list returns balance 0 for an unlimited loose cusEnt.
 *      NOTE: this spreads the raw DB row today, so it goes RED
 *      mid-implementation (leaking -5) until the hard-coded clamp lands in
 *      handleListBalances — that red is the signal to add the clamp, not to
 *      touch this assertion.
 *   2. V2_3 check returns allowed + unlimited with usage = tracked total (5)
 *      and granted/remaining 0.
 *   3. the V2_3 customer object's feature block reports unlimited with
 *      usage 5 and granted/remaining 0.
 */

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
		// RED today: track on unlimited short-circuits and balance stays 0.
		expect(cusEnt?.balance).toBe(-TRACKED);
	});
});
