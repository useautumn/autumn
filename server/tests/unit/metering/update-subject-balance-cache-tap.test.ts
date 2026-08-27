/** The absolute-set commit point: `updateSubjectBalanceCache` installs a
 *  balance the delta tap can never express, so it needs its own mirror. These
 *  cover what the mirrored event has to carry for the metering fold to join it
 *  with the deduct events a later track produces. */

import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { RepoContext } from "@/db/repoContext.js";
import type { ShadowTapParams } from "@/internal/metering/shadow/shadowEvent.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const recorded: (ShadowTapParams & { type: string })[] = [];

await mockModuleWithRestore("@/internal/metering/shadow/shadowTap.js", () => ({
	shadowTapSet: (params: ShadowTapParams) => {
		recorded.push({ ...params, type: "set" });
	},
}));

const { updateSubjectBalanceCache } = await import(
	// @ts-expect-error - Bun cache-busting query isolates module mocks.
	"@/internal/customers/cusProducts/cusEnts/actions/cache/updateSubjectBalanceCache.js?setTap"
);

const CUSTOMER_ENTITLEMENT_ID = "ce_1";

/** Only the surface `tryRedisWrite` and the cache action touch. */
const createCtx = ({
	luaResult,
	status = "ready",
}: {
	luaResult: string;
	status?: string;
}): { ctx: RepoContext; calls: { key: string; params: string }[] } => {
	const calls: { key: string; params: string }[] = [];

	const redisV2 = {
		status,
		updateSubjectBalances: async (key: string, params: string) => {
			calls.push({ key, params });
			return luaResult;
		},
	} as unknown as Redis;

	return {
		ctx: {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			db: {} as RepoContext["db"],
			logger: {
				warn: () => {},
				error: () => {},
			} as unknown as RepoContext["logger"],
			redisV2,
		},
		calls,
	};
};

const appliedResult = JSON.stringify({
	applied: { [CUSTOMER_ENTITLEMENT_ID]: true },
	skipped: [],
});

const skippedResult = JSON.stringify({
	applied: {},
	skipped: [CUSTOMER_ENTITLEMENT_ID],
});

afterEach(() => {
	recorded.length = 0;
});

describe("updateSubjectBalanceCache metering mirror", () => {
	test("mirrors the installed balance under the public customer id", async () => {
		const { ctx } = createCtx({ luaResult: appliedResult });

		await updateSubjectBalanceCache({
			ctx,
			customerId: "cus_public_1",
			featureId: "messages",
			customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
			updates: { balance: 1000 },
		});

		expect(recorded).toHaveLength(1);
		expect(recorded[0]).toMatchObject({
			type: "set",
			orgId: "org_1",
			env: AppEnv.Sandbox,
			// The same identifier the deduct tap sends (`body.customer_id`) and the
			// same one the balance key is built from, so the two join in the fold.
			customerId: "cus_public_1",
			featureId: "messages",
			value: 1000,
		});
	});

	test("the mutation id is the post-state, so a replayed write dedupes", async () => {
		const { ctx } = createCtx({ luaResult: appliedResult });

		for (let attempt = 0; attempt < 2; attempt++) {
			await updateSubjectBalanceCache({
				ctx,
				customerId: "cus_public_1",
				featureId: "messages",
				customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
				updates: { balance: 1000 },
			});
		}

		expect(recorded).toHaveLength(2);
		expect(recorded[0].idempotencyKey).toBe(
			`cus_ent:${CUSTOMER_ENTITLEMENT_ID}:set:1000`,
		);
		expect(recorded[1].idempotencyKey).toBe(recorded[0].idempotencyKey);
	});

	test("a zero balance still mirrors", async () => {
		const { ctx } = createCtx({ luaResult: appliedResult });

		await updateSubjectBalanceCache({
			ctx,
			customerId: "cus_public_1",
			featureId: "messages",
			customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
			updates: { balance: 0 },
		});

		expect(recorded).toHaveLength(1);
		expect(recorded[0].value).toBe(0);
		expect(recorded[0].idempotencyKey).toBe(
			`cus_ent:${CUSTOMER_ENTITLEMENT_ID}:set:0`,
		);
	});

	test("a cache miss the Lua skipped installs nothing, so nothing mirrors", async () => {
		const { ctx } = createCtx({ luaResult: skippedResult });

		await updateSubjectBalanceCache({
			ctx,
			customerId: "cus_public_1",
			featureId: "messages",
			customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
			updates: { balance: 1000 },
		});

		expect(recorded).toHaveLength(0);
	});

	test("a write that never reached Redis does not mirror", async () => {
		const { ctx, calls } = createCtx({
			luaResult: appliedResult,
			status: "connecting",
		});

		await updateSubjectBalanceCache({
			ctx,
			customerId: "cus_public_1",
			featureId: "messages",
			customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
			updates: { balance: 1000 },
		}).catch(() => {});

		expect(calls).toHaveLength(0);
		expect(recorded).toHaveLength(0);
	});

	test("updates that install no balance have no post-state to mirror", async () => {
		const { ctx } = createCtx({ luaResult: appliedResult });

		for (const updates of [
			{ next_reset_at: 1_700_000_000_000 },
			{ adjustment: 250 },
			{ balance: null },
		]) {
			await updateSubjectBalanceCache({
				ctx,
				customerId: "cus_public_1",
				featureId: "messages",
				customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
				updates,
			});
		}

		expect(recorded).toHaveLength(0);
	});
});
