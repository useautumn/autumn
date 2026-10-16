/**
 * Finalize and the lock receipt backup:
 *   - the backup is deleted before the lock settles, and not written back after
 *   - a lock that stays open (balance rejection) gets its backup back
 *   - when the backup cannot be deleted nothing settles, and the claim is released for a retry
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { InsufficientBalanceError } from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const calls: string[] = [];
const mockState = {
	deleteBackupError: null as unknown,
	settleError: null as unknown,
};

await mockModuleWithRestore(
	"@/internal/balances/utils/lockV2/lockReceiptBackup.js",
	() => ({
		deleteLockReceiptBackupOrThrow: async () => {
			calls.push("deleteBackup");
			if (mockState.deleteBackupError) throw mockState.deleteBackupError;
		},
		copyLockReceiptToBackup: async () => {
			calls.push("copyBackup");
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js",
	() => ({
		buildFinalizeLockContextV2: async () => ({
			redisInstance: {},
			finalValue: 0,
			lockValue: 100,
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/finalizeLock/runRedisFinalizeLockV2.js",
	() => ({
		runRedisFinalizeLockV2: async () => {
			calls.push("settle");
			if (mockState.settleError) throw mockState.settleError;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/lockV2/releaseLockClaimMarker.js",
	() => ({
		releaseLockClaimMarker: async () => {
			calls.push("releaseClaim");
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/lockV2/deleteLockReceiptV2.js",
	() => ({
		deleteLockReceiptV2: async () => {
			calls.push("deleteReceipt");
		},
	}),
);

import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runFinalizeLockV2 } from "@/internal/balances/finalizeLock/runFinalizeLockV2.js";

const args = {
	ctx: {
		org: { id: "org_123" },
		env: "live",
		logger: { error: () => undefined, warn: () => undefined },
	},
	params: { lock_id: "lock_123", action: "release" },
	receipt: { customer_id: "cus_123", feature_id: "credits", items: [] },
	lockReceiptKey: "{org_123}:live:lock_receipt:1",
	claimed: true,
	lockRedisInstance: {},
} as never;

beforeEach(() => {
	calls.length = 0;
	mockState.deleteBackupError = null;
	mockState.settleError = null;
});

describe("runFinalizeLockV2 with a receipt backup", () => {
	test("deletes the backup before settling and does not write it back", async () => {
		await runFinalizeLockV2(args);

		expect(calls).toEqual(["deleteBackup", "settle", "deleteReceipt"]);
	});

	test("a lock left open by a balance rejection gets its backup back", async () => {
		mockState.settleError = new InsufficientBalanceError({
			value: 0,
			featureId: "credits",
		});

		await expect(runFinalizeLockV2(args)).rejects.toBeInstanceOf(
			InsufficientBalanceError,
		);
		// Backed up while the claim is still held, and only once.
		expect(calls).toEqual([
			"deleteBackup",
			"settle",
			"copyBackup",
			"releaseClaim",
		]);
	});

	test("nothing settles when the backup cannot be deleted, and the claim is released", async () => {
		mockState.deleteBackupError = new Error("Connection is closed.");

		await expect(runFinalizeLockV2(args)).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(calls).toEqual(["deleteBackup", "releaseClaim"]);
	});
});
