/**
 * Contract under test — DynamoDB is the only idempotency-key store:
 *   - claimed → the request proceeds.
 *   - duplicate → 409 DuplicateIdempotencyKey.
 *   - unavailable → fails OPEN, so a Dynamo outage never rejects live traffic.
 *   - The per-route-group ttlMs reaches the store unchanged.
 *   - Check and release address the same partition key, whose format is
 *     load-bearing across a deploy.
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
import {
	buildIdempotencyStorageKey,
	IDEMPOTENCY_TTL_MS,
	type IdempotencyClaimResult,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

const mockState = {
	// mock.module is process-wide and leaks into later test files, and bun
	// links other files' import bindings before afterAll can re-mock — so the
	// mocks stay installed but delegate to the real implementations once this
	// suite is done (passthrough=true).
	passthrough: false,
	claimResult: "claimed" as IdempotencyClaimResult,
	claims: [] as string[],
	claimTtls: [] as Array<number | undefined>,
	releases: [] as string[],
};

// Real implementations for the passthrough delegation. Snapshot the FUNCTION
// references before mocking — a module namespace has live bindings, so after
// mock.module it would resolve to the mock and passthrough would recurse.
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
	"@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js",
	() => ({
		claimDynamoIdempotencyKey: async (args: {
			storageKey: string;
			ttlMs?: number;
		}) => {
			if (mockState.passthrough) {
				return realClaimDynamo(args);
			}
			mockState.claims.push(args.storageKey);
			mockState.claimTtls.push(args.ttlMs);
			return mockState.claimResult;
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
			mockState.releases.push(args.storageKey);
		},
	}),
);

import { checkIdempotencyKey } from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import { releaseIdempotencyKey } from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";

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

describe("checkIdempotencyKey (DynamoDB only)", () => {
	beforeEach(() => {
		mockState.claimResult = "claimed";
		mockState.claims = [];
		mockState.claimTtls = [];
		mockState.releases = [];
	});

	afterEach(() => {
		mockState.claimResult = "claimed";
	});

	afterAll(() => {
		mockState.passthrough = true;
	});

	test("claims the key and lets the request proceed", async () => {
		await expect(check()).resolves.toBeUndefined();
		expect(mockState.claims).toHaveLength(1);
	});

	test("rejects a duplicate with a 409", async () => {
		mockState.claimResult = "duplicate";

		const promise = check();
		await expect(promise).rejects.toThrow(RecaseError);
		await promise.catch((error: RecaseError) => {
			expect(error.code).toBe(ErrCode.DuplicateIdempotencyKey);
			expect(error.statusCode).toBe(409);
		});
	});

	test("fails open when Dynamo is unavailable", async () => {
		mockState.claimResult = "unavailable";

		await expect(check()).resolves.toBeUndefined();
	});

	test("passes ttlMs through to the store", async () => {
		await checkIdempotencyKey({
			ctx: testCtx,
			idempotencyKey: "key-1",
			ttlMs: 12_345,
		});

		expect(mockState.claimTtls).toEqual([12_345]);
	});

	test("check and release address the same partition key", async () => {
		await check();
		await release();

		const { storageKey, hashedKey } = buildIdempotencyStorageKey({
			orgId: "org_123",
			env: "sandbox",
			idempotencyKey: "key-1",
		});

		expect(storageKey).toBe(`org_123:sandbox:idempotency:${hashedKey}`);
		expect(mockState.claims).toEqual([storageKey]);
		expect(mockState.releases).toEqual([storageKey]);
	});

	test("defaults to a 24h TTL", () => {
		expect(IDEMPOTENCY_TTL_MS).toBe(24 * 60 * 60 * 1000);
	});
});
