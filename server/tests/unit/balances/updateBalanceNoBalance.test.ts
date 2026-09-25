/**
 * balances.update must not report success when it resolves no entitlements.
 *
 * Pre-fix, a mutation that matched nothing — an unassigned feature, a typo'd
 * balance_id, or a fully drained one-off grant — ran to completion against an
 * empty entitlement list and returned `{ success: true }`, so a caller could
 * not tell a real update from a silent no-op.
 */

import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	ErrCode,
	type FullSubject,
	RecaseError,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const emptySubject = {
	customer: { config: {} },
	customer_products: [],
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
	entity: undefined,
} as unknown as FullSubject;

let subject: FullSubject = emptySubject;
let remainingUpdates = 0;

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async () => subject,
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/updateBalance/v2/updateRemainingV2.js",
	() => ({
		updateRemainingV2: async () => {
			remainingUpdates += 1;
		},
	}),
);

const { updateBalanceOnCacheV2 } = await import(
	"@/internal/balances/updateBalance/v2/updateBalanceOnCacheV2.js"
);

const ctx = { features: [] } as unknown as AutumnContext;

const runUpdate = (params: Partial<UpdateBalanceParamsV0>) =>
	updateBalanceOnCacheV2({
		ctx,
		params: {
			customer_id: "cus_remy",
			feature_id: "credits",
			...params,
		} as UpdateBalanceParamsV0,
	});

/** A loose grant the caller can still reach, i.e. not drained to zero. */
const subjectWithLooseGrant = {
	...emptySubject,
	extra_customer_entitlements: [
		{
			id: "cus_ent_live",
			external_id: "starter",
			balance: 40,
			entitlement: { feature: { id: "credits" }, interval: "lifetime" },
		},
	],
} as unknown as FullSubject;

describe("balances.update with no matching balance", () => {
	test("rejects when the customer has no entitlement for the feature", async () => {
		subject = emptySubject;

		const error = (await runUpdate({ add_to_balance: 40 }).catch(
			(caught) => caught,
		)) as RecaseError;

		expect(error).toBeInstanceOf(RecaseError);
		expect(error.code).toBe(ErrCode.CustomerEntitlementNotFound);
		expect(error.statusCode).toBe(404);
		expect(error.message).toContain("credits");
		expect(error.message).toContain("billing.attach");
		expect(error.message).toContain("balances.create");
	});

	test("names the balance_id that matched nothing", async () => {
		subject = subjectWithLooseGrant;

		const error = (await runUpdate({
			add_to_balance: 40,
			balance_id: "startr",
		}).catch((caught) => caught)) as RecaseError;

		expect(error).toBeInstanceOf(RecaseError);
		expect(error.message).toContain("balance_id 'startr'");
	});

	test("allows a mutation that resolves a live balance", async () => {
		subject = subjectWithLooseGrant;
		remainingUpdates = 0;

		await runUpdate({ add_to_balance: 40, balance_id: "starter" });

		expect(remainingUpdates).toBe(1);
	});

	test("ignores requests that change no balance", async () => {
		subject = emptySubject;
		remainingUpdates = 0;

		await runUpdate({});

		expect(remainingUpdates).toBe(0);
	});
});

afterAll(() => {
	mock.restore();
});
