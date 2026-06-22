/**
 * TDD test for body-level track idempotency release semantics.
 *
 * Contract under test:
 *   New types/fields:
 *     - none
 *   New endpoints:
 *     - none
 *   New behaviors:
 *     - body.idempotency_key reserves `track:${idempotency_key}` before work.
 *     - successful work keeps the key.
 *     - releasable failures release the key, matching idempotencyMiddleware.
 *     - duplicate-idempotency failures are not released.
 *     - missing body.idempotency_key does not touch Redis idempotency.
 *   Side effects:
 *     - Redis idempotency key is deleted after non-409 track failures.
 *
 * Pre-impl red: the middleware-style wrapper does not exist.
 * Post-impl green: body idempotency surrounds track work and releases on failure.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	checkCalls: [] as Record<string, unknown>[],
	releaseCalls: [] as Record<string, unknown>[],
};

mock.module("@/internal/misc/idempotency/checkIdempotencyKey.js", () => ({
	checkIdempotencyKey: async (args: Record<string, unknown>) => {
		mockState.checkCalls.push(args);
	},
	releaseIdempotencyKey: async (args: Record<string, unknown>) => {
		mockState.releaseCalls.push(args);
	},
}));

import { withTrackBodyIdempotency } from "@/internal/balances/track/utils/withTrackBodyIdempotency.js";

const ctx = {
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	logger: {},
} as AutumnContext;

describe("withTrackBodyIdempotency", () => {
	beforeEach(() => {
		mockState.checkCalls = [];
		mockState.releaseCalls = [];
	});

	test("does not touch Redis idempotency when the body has no idempotency key", async () => {
		const result = await withTrackBodyIdempotency({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
			},
			run: async () => "ok",
		});

		expect(result).toBe("ok");
		expect(mockState.checkCalls).toHaveLength(0);
		expect(mockState.releaseCalls).toHaveLength(0);
	});

	test("reserves and keeps the key when track work succeeds", async () => {
		const result = await withTrackBodyIdempotency({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				idempotency_key: "body-key-1",
			},
			run: async () => "ok",
		});

		expect(result).toBe("ok");
		expect(mockState.checkCalls).toEqual([
			expect.objectContaining({
				orgId: "org_123",
				env: AppEnv.Sandbox,
				idempotencyKey: "track:body-key-1",
			}),
		]);
		expect(mockState.releaseCalls).toHaveLength(0);
	});

	test("releases the key when track work throws a releasable error", async () => {
		const error = new RecaseError({
			message: "not enough balance",
			code: ErrCode.InsufficientBalance,
			statusCode: 400,
		});

		await expect(
			withTrackBodyIdempotency({
				ctx,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					idempotency_key: "body-key-2",
				},
				run: async () => {
					throw error;
				},
			}),
		).rejects.toBe(error);

		expect(mockState.releaseCalls).toEqual([
			expect.objectContaining({
				orgId: "org_123",
				env: AppEnv.Sandbox,
				idempotencyKey: "track:body-key-2",
			}),
		]);
	});

	test("releases the key when track work throws an unmapped error", async () => {
		const error = new Error("unexpected track failure");

		await expect(
			withTrackBodyIdempotency({
				ctx,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					idempotency_key: "body-key-raw-error",
				},
				run: async () => {
					throw error;
				},
			}),
		).rejects.toBe(error);

		expect(mockState.releaseCalls).toEqual([
			expect.objectContaining({
				orgId: "org_123",
				env: AppEnv.Sandbox,
				idempotencyKey: "track:body-key-raw-error",
			}),
		]);
	});

	test("does not release duplicate idempotency failures", async () => {
		const error = new RecaseError({
			message: "duplicate",
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		});

		await expect(
			withTrackBodyIdempotency({
				ctx,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					idempotency_key: "body-key-3",
				},
				run: async () => {
					throw error;
				},
			}),
		).rejects.toBe(error);

		expect(mockState.releaseCalls).toHaveLength(0);
	});
});
