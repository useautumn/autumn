import { describe, expect, test } from "bun:test";
import { AppEnv, ms } from "@autumn/shared";
import { dueLockToConfirmExpiredLockCommand } from "@/internal/balances/lockSweep/actions/confirmExpiredLocks.js";
import type { DueBalanceLock } from "@/internal/balances/lockSweep/repos/balanceLocks.js";
import { lockSweepResultToDelayMs } from "@/internal/balances/lockSweep/runLockSweepLoop.js";

const dueLock = ({
	id,
	customerId,
}: {
	id: string;
	customerId: string;
}): DueBalanceLock => ({
	id,
	org_id: "org",
	env: AppEnv.Sandbox,
	lock_id: `L_${id}`,
	customer_id: customerId,
	expires_at: 1_000,
});

describe("lock sweep", () => {
	test("a due lock becomes a command keyed on its row id, so a retry is the same command", () => {
		const lock = dueLock({ id: "lck_1", customerId: "cus_a" });
		expect(dueLockToConfirmExpiredLockCommand({ lock, now: 5_000 })).toEqual({
			schemaVersion: 1,
			type: "confirmExpiredLock",
			commandId: "lock-sweep:lck_1",
			requestId: "lock-sweep:lck_1",
			occurredAt: 5_000,
			identity: {
				orgId: "org",
				env: AppEnv.Sandbox,
				customerId: "cus_a",
				entityId: null,
			},
			lock: { id: "lck_1", lock_id: "L_lck_1" },
		});
	});

	test("the loop comes straight back only when the deadline cut a pass short", () => {
		const delayOf = (result: { fetched: number; pageSize: number } | null) =>
			lockSweepResultToDelayMs({ result });
		expect(delayOf({ fetched: 1_000, pageSize: 500 })).toBe(ms.seconds(1));
		expect(delayOf({ fetched: 700, pageSize: 500 })).toBe(ms.seconds(30));
		expect(delayOf({ fetched: 0, pageSize: 500 })).toBe(ms.seconds(30));
		// Not swept at all: disabled, inactive slot, or the batch failed.
		expect(delayOf(null)).toBe(ms.seconds(30));
	});
});
