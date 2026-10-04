/**
 * Lock receipts live in the Redis V2 cache, which evicts under memory pressure. These cover the
 * misc Redis backup that lets finalize put an evicted receipt back:
 *   - an evicted receipt is restored from its backup and claimed
 *   - the backup expires with the receipt, so it never revives one past its TTL
 *   - a backup deleted mid-restore (a concurrent finalize settled the lock) revives nothing
 *   - a Redis failure while fetching is a retryable error, not "Lock not found"
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type Entry = { value: string; expiresAtMs: number | null };

/** Just enough of ioredis for the receipt and backup code paths. */
class FakeRedis {
	status = "ready";
	store = new Map<string, Entry>();
	failExec = false;
	onExists?: () => void;

	private live(key: string): Entry | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;
		if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		return entry;
	}

	async get(key: string) {
		return this.live(key)?.value ?? null;
	}

	async set(key: string, value: string, ...args: (string | number)[]) {
		let expiresAtMs: number | null = null;
		let onlyIfAbsent = false;
		for (let index = 0; index < args.length; index++) {
			const flag = String(args[index]).toUpperCase();
			if (flag === "NX") onlyIfAbsent = true;
			if (flag === "PX") expiresAtMs = Date.now() + Number(args[++index]);
			if (flag === "EX")
				expiresAtMs = Date.now() + Number(args[++index]) * 1000;
			if (flag === "EXAT") expiresAtMs = Number(args[++index]) * 1000;
		}
		if (onlyIfAbsent && this.live(key)) return null;
		this.store.set(key, { value, expiresAtMs });
		return "OK";
	}

	async pttl(key: string) {
		const entry = this.live(key);
		if (!entry) return -2;
		if (entry.expiresAtMs === null) return -1;
		return entry.expiresAtMs - Date.now();
	}

	async del(...keys: string[]) {
		let removed = 0;
		for (const key of keys) if (this.store.delete(key)) removed++;
		return removed;
	}

	async exists(key: string) {
		this.onExists?.();
		return this.live(key) ? 1 : 0;
	}

	pipeline() {
		const commands: (() => Promise<unknown>)[] = [];
		const chain = {
			get: (key: string) => {
				commands.push(() => this.get(key));
				return chain;
			},
			pttl: (key: string) => {
				commands.push(() => this.pttl(key));
				return chain;
			},
			set: (key: string, value: string, ...args: (string | number)[]) => {
				commands.push(() => this.set(key, value, ...args));
				return chain;
			},
			exec: async () => {
				if (this.failExec) throw new Error("Connection is closed.");
				const replies: [null, unknown][] = [];
				for (const command of commands) replies.push([null, await command()]);
				return replies;
			},
		};
		return chain;
	}
}

const cacheRedis = new FakeRedis();
const miscRedis = new FakeRedis();

await mockModuleWithRestore("@/external/redis/initRedis.js", () => ({
	getMiscRedis: () => miscRedis,
}));
await mockModuleWithRestore("@/external/redis/customerRedisRouting.js", () => ({
	resolveCustomerRedisRouting: () => ({
		redis: cacheRedis,
		usesDedicatedRedis: false,
	}),
}));
await mockModuleWithRestore(
	"@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js",
	() => ({ getRedisV2LockReceiptCandidates: () => [cacheRedis] }),
);
await mockModuleWithRestore("@/external/redis/utils/runRedisOp.js", () => ({
	tryRedisOp: async ({
		operation,
		redisInstance,
	}: {
		operation: (redis: unknown) => Promise<unknown>;
		redisInstance: unknown;
	}) => {
		try {
			return await operation(redisInstance);
		} catch {
			return undefined;
		}
	},
}));

import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import {
	copyLockReceiptToBackup,
	restoreLockReceiptFromBackup,
} from "@/internal/balances/utils/lockV2/lockReceiptBackup.js";

const ctx = {
	org: { id: "org_123" },
	env: "live",
	logger: { warn: () => undefined, info: () => undefined },
} as never;

const lockId = "request:abc:agent:admission";
const lockReceiptKey = buildLockReceiptKey({
	orgId: "org_123",
	env: "live",
	lockKey: Bun.hash(lockId).toString(),
});
const claimMarkerKey = `${lockReceiptKey}:claim`;
const receipt = {
	lock_id: lockId,
	customer_id: "cus_123",
	feature_id: "credits",
	items: [],
};
const ONE_HOUR_MS = 60 * 60 * 1000;

/** What a check leaves behind: the receipt in the cache, and its backup. */
const takeLock = async () => {
	await cacheRedis.set(
		lockReceiptKey,
		JSON.stringify(receipt),
		"PX",
		ONE_HOUR_MS,
	);
	await copyLockReceiptToBackup({
		ctx,
		lockReceiptKey,
		redisInstance: cacheRedis as never,
	});
};

beforeEach(() => {
	cacheRedis.store.clear();
	miscRedis.store.clear();
	cacheRedis.failExec = false;
	miscRedis.onExists = undefined;
});

describe("lock receipt backup", () => {
	test("an evicted receipt is restored from its backup and claimed", async () => {
		await takeLock();
		await cacheRedis.del(lockReceiptKey);

		const fetched = await fetchLockReceipt({ ctx, lockId });

		expect(fetched.claimed).toBe(true);
		expect(fetched.receipt.customer_id).toBe("cus_123");
		expect(await cacheRedis.get(lockReceiptKey)).toBe(JSON.stringify(receipt));
		expect(await cacheRedis.get(claimMarkerKey)).toBe("1");
	});

	test("the backup expires with the receipt, so it never revives one past its TTL", async () => {
		await takeLock();

		const receiptTtlMs = await cacheRedis.pttl(lockReceiptKey);
		const backupTtlMs = await miscRedis.pttl(lockReceiptKey);

		expect(backupTtlMs).toBeGreaterThan(0);
		expect(Math.abs(receiptTtlMs - backupTtlMs)).toBeLessThan(1000);
	});

	test("a lock with no receipt and no backup still answers Lock not found", async () => {
		await expect(fetchLockReceipt({ ctx, lockId })).rejects.toThrow(
			`Lock not found for ID: ${lockId}`,
		);
	});

	test("a backup deleted mid-restore revives nothing, so a settled lock cannot settle twice", async () => {
		await takeLock();
		await cacheRedis.del(lockReceiptKey);
		// A concurrent finalize settles the lock between this restore's read and its check.
		miscRedis.onExists = () => {
			miscRedis.store.delete(lockReceiptKey);
		};

		const restored = await restoreLockReceiptFromBackup({ ctx, lockId });

		expect(restored).toBe(false);
		expect(await cacheRedis.get(lockReceiptKey)).toBeNull();
	});

	test("a Redis failure while fetching is retryable, not Lock not found", async () => {
		await takeLock();
		cacheRedis.failExec = true;

		await expect(fetchLockReceipt({ ctx, lockId })).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
	});
});
