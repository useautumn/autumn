/**
 * Contract under test — Redis ↔ DynamoDB idempotency authority routing:
 *   - Keys are ALWAYS dual-written to both stores.
 *   - idempotencyDynamoRead off (default): Redis is the authority (awaited;
 *     duplicate → 409; unavailable → fail open). Dynamo is a fire-and-forget
 *     mirror whose result never affects the outcome.
 *   - idempotencyDynamoRead on: exactly the mirror image — Dynamo is the
 *     authority, Redis is the silent mirror.
 *   - The mirror is written even when the authority rejects a duplicate, so
 *     the stores converge.
 *   - Release always clears both stores.
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
import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { IdempotencyClaimResult } from "@/internal/misc/idempotency/idempotencyKeyUtils.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import { _setMiscellaneousEdgeConfigForTesting } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const mockState = {
	// mock.module is process-wide and leaks into later test files, and bun
	// links other files' import bindings before afterAll can re-mock — so the
	// mocks stay installed but delegate to the real implementations once this
	// suite is done (passthrough=true).
	passthrough: false,
	redisClaimResult: "claimed" as IdempotencyClaimResult,
	dynamoClaimResult: "claimed" as IdempotencyClaimResult,
	redisClaims: [] as string[],
	dynamoClaims: [] as string[],
	redisClaimTtls: [] as Array<number | undefined>,
	dynamoClaimTtls: [] as Array<number | undefined>,
	redisReleases: [] as string[],
	dynamoReleases: [] as string[],
};

// Real implementations for the passthrough delegation. Snapshot the FUNCTION
// references before mocking — a module namespace has live bindings, so after
// mock.module it would resolve to the mock and passthrough would recurse.
const realClaimRedis = (
	await import(
		"@/external/redis/idempotencyKeys/operations/claimRedisIdempotencyKey.js"
	)
).claimRedisIdempotencyKey;
const realReleaseRedis = (
	await import(
		"@/external/redis/idempotencyKeys/operations/releaseRedisIdempotencyKey.js"
	)
).releaseRedisIdempotencyKey;
const realClaimDynamo = (
	await import(
		"@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js"
	)
).claimDynamoIdempotencyKey;
const realReleaseDynamo = (
	await import(
		"@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js"
	)
).releaseDynamoIdempotencyKey;

mock.module(
	"@/external/redis/idempotencyKeys/operations/claimRedisIdempotencyKey.js",
	() => ({
		claimRedisIdempotencyKey: async (args: {
			storageKey: string;
			ttlMs?: number;
		}) => {
			if (mockState.passthrough) {
				return realClaimRedis(args);
			}
			mockState.redisClaims.push(args.storageKey);
			mockState.redisClaimTtls.push(args.ttlMs);
			return mockState.redisClaimResult;
		},
	}),
);

mock.module(
	"@/external/redis/idempotencyKeys/operations/releaseRedisIdempotencyKey.js",
	() => ({
		releaseRedisIdempotencyKey: async (args: { storageKey: string }) => {
			if (mockState.passthrough) {
				return realReleaseRedis(args);
			}
			mockState.redisReleases.push(args.storageKey);
		},
	}),
);

mock.module(
	"@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js",
	() => ({
		claimDynamoIdempotencyKey: async (args: {
			storageKey: string;
			ttlMs?: number;
		}) => {
			if (mockState.passthrough) {
				return realClaimDynamo(args);
			}
			mockState.dynamoClaims.push(args.storageKey);
			mockState.dynamoClaimTtls.push(args.ttlMs);
			return mockState.dynamoClaimResult;
		},
	}),
);

mock.module(
	"@/external/aws/dynamodb/idempotencyKeys/operations/releaseDynamoIdempotencyKey.js",
	() => ({
		releaseDynamoIdempotencyKey: async (args: { storageKey: string }) => {
			if (mockState.passthrough) {
				return realReleaseDynamo(args);
			}
			mockState.dynamoReleases.push(args.storageKey);
		},
	}),
);

import { checkIdempotencyKey } from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import { releaseIdempotencyKey } from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setDynamoRead = (idempotencyDynamoRead: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, idempotencyDynamoRead },
	});
};

const testCtx = {
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		info: () => undefined,
		warn: () => undefined,
	},
} as unknown as AutumnContext;

const check = () =>
	checkIdempotencyKey({ ctx: testCtx, idempotencyKey: "key-1" });

const release = () =>
	releaseIdempotencyKey({ ctx: testCtx, idempotencyKey: "key-1" });

const expectDuplicateRejection = async (promise: Promise<void>) => {
	await expect(promise).rejects.toThrow(RecaseError);
	await promise.catch((error: RecaseError) => {
		expect(error.code).toBe(ErrCode.DuplicateIdempotencyKey);
		expect(error.statusCode).toBe(409);
	});
};

describe("checkIdempotencyKey authority routing", () => {
	beforeEach(() => {
		mockState.redisClaimResult = "claimed";
		mockState.dynamoClaimResult = "claimed";
		mockState.redisClaims = [];
		mockState.dynamoClaims = [];
		mockState.redisClaimTtls = [];
		mockState.dynamoClaimTtls = [];
		mockState.redisReleases = [];
		mockState.dynamoReleases = [];
	});

	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	afterAll(() => {
		mockState.passthrough = true;
	});

	describe("ttl threading", () => {
		test("passes ttlMs through to both stores", async () => {
			await checkIdempotencyKey({
				ctx: testCtx,
				idempotencyKey: "key-1",
				ttlMs: 12_345,
			});

			expect(mockState.redisClaimTtls).toEqual([12_345]);
			expect(mockState.dynamoClaimTtls).toEqual([12_345]);
		});
	});

	describe("redis authority (flag off, the default)", () => {
		test("claims both stores with the same storage key", async () => {
			await check();

			expect(mockState.redisClaims).toHaveLength(1);
			expect(mockState.dynamoClaims).toHaveLength(1);
			expect(mockState.dynamoClaims[0]).toBe(mockState.redisClaims[0]);
		});

		test("rejects on a Redis duplicate, still mirroring to Dynamo", async () => {
			mockState.redisClaimResult = "duplicate";

			await expectDuplicateRejection(check());
			expect(mockState.dynamoClaims).toHaveLength(1);
		});

		test("ignores a Dynamo duplicate on the mirror write", async () => {
			mockState.dynamoClaimResult = "duplicate";

			await expect(check()).resolves.toBeUndefined();
		});

		test("ignores a Dynamo outage on the mirror write", async () => {
			mockState.dynamoClaimResult = "unavailable";

			await expect(check()).resolves.toBeUndefined();
		});

		test("fails open when Redis is unavailable", async () => {
			mockState.redisClaimResult = "unavailable";

			await expect(check()).resolves.toBeUndefined();
		});

		test("releases both stores", async () => {
			await release();

			expect(mockState.redisReleases).toHaveLength(1);
			expect(mockState.dynamoReleases).toHaveLength(1);
		});
	});

	describe("dynamo authority (flag on)", () => {
		beforeEach(() => {
			setDynamoRead(true);
		});

		test("claims both stores with the same storage key", async () => {
			await check();

			expect(mockState.dynamoClaims).toHaveLength(1);
			expect(mockState.redisClaims).toHaveLength(1);
			expect(mockState.redisClaims[0]).toBe(mockState.dynamoClaims[0]);
		});

		test("rejects on a Dynamo duplicate, still mirroring to Redis", async () => {
			mockState.dynamoClaimResult = "duplicate";

			await expectDuplicateRejection(check());
			expect(mockState.redisClaims).toHaveLength(1);
		});

		test("ignores a Redis duplicate on the mirror write", async () => {
			mockState.redisClaimResult = "duplicate";

			await expect(check()).resolves.toBeUndefined();
		});

		test("fails open when Dynamo is unavailable, even if Redis has the key", async () => {
			mockState.dynamoClaimResult = "unavailable";
			mockState.redisClaimResult = "duplicate";

			await expect(check()).resolves.toBeUndefined();
		});

		test("releases both stores", async () => {
			await release();

			expect(mockState.redisReleases).toHaveLength(1);
			expect(mockState.dynamoReleases).toHaveLength(1);
		});
	});
});
