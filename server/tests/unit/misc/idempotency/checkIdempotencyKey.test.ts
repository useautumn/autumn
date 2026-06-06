/**
 * Unit tests for the idempotency-key check + release pair.
 *
 * Covers the regression for #1138: when a side-effecting operation guarded
 * by an idempotency key FAILS, `releaseIdempotencyKey` must delete the
 * Redis-stored key so that a subsequent retry can succeed once the failure
 * cause (insufficient balance, transient Redis fault, etc.) is resolved.
 *
 * Without release, the key sat in Redis for 24h and every retry hit a
 * 409 "duplicate_idempotency_key" wall.
 */
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { AppEnv, RecaseError } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils";

type RedisCall = { method: string; args: unknown[] };
const redisState = {
	status: "ready" as "ready" | "wait" | "end",
	store: new Map<string, string>(),
	calls: [] as RedisCall[],
	throwOn: null as null | { method: string; error: Error },
};

mock.module("@/external/redis/initRedis.js", () => ({
	redis: {
		get status() {
			return redisState.status;
		},
		set: async (key: string, value: string, ...args: unknown[]) => {
			redisState.calls.push({ method: "set", args: [key, value, ...args] });
			if (
				redisState.throwOn?.method === "set"
			) throw redisState.throwOn.error;
			// Mimic SET NX semantics: return null if key already exists, "OK" otherwise.
			const nxIndex = args.findIndex(
				(a) => typeof a === "string" && a.toUpperCase() === "NX",
			);
			if (nxIndex >= 0 && redisState.store.has(key)) return null;
			redisState.store.set(key, value);
			return "OK";
		},
		del: async (key: string) => {
			redisState.calls.push({ method: "del", args: [key] });
			if (redisState.throwOn?.method === "del") throw redisState.throwOn.error;
			const existed = redisState.store.has(key);
			redisState.store.delete(key);
			return existed ? 1 : 0;
		},
	},
	currentRegion: "test",
}));

import {
	checkIdempotencyKey,
	releaseIdempotencyKey,
} from "@/internal/misc/idempotency/checkIdempotencyKey.js";

const noopLogger: Logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
	// biome-ignore lint/suspicious/noExplicitAny: minimal logger shape for tests
} as any;

const baseArgs = {
	orgId: "org_test",
	env: AppEnv.Sandbox,
	idempotencyKey: "track:req_abc123",
	logger: noopLogger,
};

beforeEach(() => {
	redisState.status = "ready";
	redisState.store.clear();
	redisState.calls.length = 0;
	redisState.throwOn = null;
});

afterEach(() => {
	redisState.throwOn = null;
});

afterAll(() => {
	mock.restore();
});

describe("checkIdempotencyKey + releaseIdempotencyKey", () => {
	test("first call sets the key; second call throws 409 (atomic SET NX)", async () => {
		await checkIdempotencyKey(baseArgs);
		await expect(checkIdempotencyKey(baseArgs)).rejects.toBeInstanceOf(
			RecaseError,
		);
		const setCalls = redisState.calls.filter((c) => c.method === "set");
		expect(setCalls).toHaveLength(2);
		// Both calls used NX
		for (const c of setCalls) {
			expect(c.args.some((a) => String(a).toUpperCase() === "NX")).toBe(true);
		}
	});

	test("releaseIdempotencyKey deletes the key so a retry can succeed (#1138)", async () => {
		await checkIdempotencyKey(baseArgs);
		// Simulate the side-effecting operation FAILED; release the claim.
		await releaseIdempotencyKey(baseArgs);
		// A retry must now succeed (no 409).
		await expect(checkIdempotencyKey(baseArgs)).resolves.toBeUndefined();
		const delCalls = redisState.calls.filter((c) => c.method === "del");
		expect(delCalls).toHaveLength(1);
	});

	test("release is a no-op when Redis is not ready (fail-open, matches check)", async () => {
		redisState.status = "wait";
		await releaseIdempotencyKey(baseArgs);
		expect(redisState.calls).toHaveLength(0);
	});

	test("release swallows Redis errors and does not throw", async () => {
		// Pre-populate to make sure del actually attempts.
		await checkIdempotencyKey(baseArgs);
		redisState.throwOn = { method: "del", error: new Error("redis down") };
		await expect(releaseIdempotencyKey(baseArgs)).resolves.toBeUndefined();
	});

	test("releasing a never-claimed key is harmless", async () => {
		await expect(releaseIdempotencyKey(baseArgs)).resolves.toBeUndefined();
	});

	test("different idempotency keys map to different Redis keys (no cross-talk)", async () => {
		await checkIdempotencyKey({ ...baseArgs, idempotencyKey: "track:A" });
		await expect(
			checkIdempotencyKey({ ...baseArgs, idempotencyKey: "track:B" }),
		).resolves.toBeUndefined();
		// And releasing A does not affect B.
		await releaseIdempotencyKey({ ...baseArgs, idempotencyKey: "track:A" });
		await expect(
			checkIdempotencyKey({ ...baseArgs, idempotencyKey: "track:B" }),
		).rejects.toBeInstanceOf(RecaseError);
	});

	test("check fails-open when Redis is not ready (no key stored)", async () => {
		redisState.status = "wait";
		await expect(checkIdempotencyKey(baseArgs)).resolves.toBeUndefined();
		expect(redisState.calls).toHaveLength(0);
	});
});
