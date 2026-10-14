/**
 * A lock's expiry timer fires expireLock: a release by lock_id.
 *
 *  a timer armed for one lock instance (it carries the row id) releases only while that row still holds the lock id;
 *  once the lock settled, or its lock id was taken again, it releases nothing;
 *  a timer that names no row (the API path's) releases whatever holds the lock id, as before.
 */

import { beforeEach, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

let heldRowId: string | null;
let lockLookups: Record<string, unknown>[];
let releases: Record<string, unknown>[];

await mockModuleWithRestore(
	"@/internal/balances/finalizeLock/balanceWorker/getBalanceLock.js",
	() => ({
		getBalanceLock: async (args: Record<string, unknown>) => {
			lockLookups.push(args);
			return heldRowId ? { id: heldRowId } : null;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/finalizeLock/runFinalizeLock.js",
	() => ({
		runFinalizeLock: async ({
			params,
		}: {
			params: Record<string, unknown>;
		}) => {
			releases.push(params);
			return { success: true };
		},
	}),
);

const { expireLock } = await import(
	"@/internal/balances/finalizeLock/expireLock.js"
);

beforeEach(() => {
	heldRowId = null;
	lockLookups = [];
	releases = [];
});

const ctx = { org: { id: "org_1" }, env: AppEnv.Sandbox } as never;
const payload = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	lockId: "L1",
	hashedKey: "h",
};
const releaseOfL1 = {
	lock_id: "L1",
	customer_id: "",
	action: "release",
	override_value: 0,
};

test("a timer for the lock row that still holds the lock id releases it", async () => {
	heldRowId = "lck_1";

	await expireLock({ ctx, payload: { ...payload, lockRowId: "lck_1" } });

	expect(lockLookups).toEqual([
		expect.objectContaining({ lockId: "L1", customerId: "cus_1" }),
	]);
	expect(releases).toEqual([releaseOfL1]);
});

test("a timer whose lock row settled, or whose lock id another row now holds, releases nothing", async () => {
	for (const held of [null, "lck_2"]) {
		heldRowId = held;
		await expireLock({ ctx, payload: { ...payload, lockRowId: "lck_1" } });
	}

	expect(releases).toEqual([]);
});

test("a timer that names no row releases whatever holds the lock id, without reading it", async () => {
	await expireLock({ ctx, payload });

	expect(lockLookups).toEqual([]);
	expect(releases).toEqual([releaseOfL1]);
});
