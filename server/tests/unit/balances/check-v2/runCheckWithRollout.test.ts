import { describe, expect, mock, test } from "bun:test";

const mockState = {
	legacyCalls: [] as Record<string, unknown>[],
	v2Calls: [] as Record<string, unknown>[],
	v2Error: null as unknown,
	warnCalls: [] as unknown[][],
};

mock.module("@/internal/balances/check/runCheckLegacyFlow.js", () => ({
	runCheckLegacyFlow: async (args: Record<string, unknown>) => {
		mockState.legacyCalls.push(args);
		return {
			checkData: { source: "legacy" },
			response: { allowed: true, source: "legacy" },
		};
	},
}));

mock.module("@/internal/balances/check/runCheckV2.js", () => ({
	runCheckV2: async (args: Record<string, unknown>) => {
		mockState.v2Calls.push(args);
		if (mockState.v2Error) throw mockState.v2Error;

		return {
			checkData: { source: "v2" },
			response: { allowed: true, source: "v2" },
		};
	},
}));

import { runCheckWithRollout } from "@/internal/balances/check/runCheckWithRollout.js";

describe("runCheckWithRollout", () => {
	test("uses the legacy flow when the rollout is off", async () => {
		mockState.legacyCalls = [];
		mockState.v2Calls = [];
		mockState.v2Error = null;

		const result = await runCheckWithRollout({
			ctx: {
				rolloutSnapshot: undefined,
			} as never,
			body: {} as never,
			requiredBalance: 1,
		});

		expect(mockState.legacyCalls).toHaveLength(1);
		expect(mockState.v2Calls).toHaveLength(0);
		expect(result).toMatchObject({
			checkData: { source: "legacy" },
			response: { source: "legacy" },
		});
	});

	test("uses the v2 flow when the full-subject rollout is enabled", async () => {
		mockState.legacyCalls = [];
		mockState.v2Calls = [];
		mockState.v2Error = null;

		const result = await runCheckWithRollout({
			ctx: {
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 10,
				},
			} as never,
			body: {} as never,
			requiredBalance: 1,
		});

		expect(mockState.legacyCalls).toHaveLength(0);
		expect(mockState.v2Calls).toHaveLength(1);
		expect(result).toMatchObject({
			checkData: { source: "v2" },
			response: { source: "v2" },
		});
	});

	test("returns fail-open fallback when the v2 flow hits a retryable error", async () => {
		mockState.legacyCalls = [];
		mockState.v2Calls = [];
		mockState.v2Error = Object.assign(new Error("statement timeout"), {
			code: "57014",
		});
		mockState.warnCalls = [];

		const result = await runCheckWithRollout({
			ctx: {
				apiVersion: { value: "2025-02-01" },
				features: [],
				logger: {
					warn: (...args: unknown[]) => mockState.warnCalls.push(args),
				},
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 10,
				},
			} as never,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: null,
			response: {
				allowed: true,
				customer_id: "cus_123",
				required_balance: 1,
			},
		});
		expect(mockState.warnCalls).toContainEqual([
			"[check] Returning fail-open fallback response",
			expect.objectContaining({
				type: "check_fail_open_fallback",
				feature_id: "messages",
				required_balance: 1,
			}),
		]);
	});

	test("returns fail-open fallback when the v2 flow hits redis retry exhaustion", async () => {
		mockState.legacyCalls = [];
		mockState.v2Calls = [];
		mockState.v2Error = Object.assign(new Error("redis retries exhausted"), {
			name: "MaxRetriesPerRequestError",
		});
		mockState.warnCalls = [];

		const result = await runCheckWithRollout({
			ctx: {
				apiVersion: { value: "2025-02-01" },
				features: [],
				logger: {
					warn: (...args: unknown[]) => mockState.warnCalls.push(args),
				},
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 10,
				},
			} as never,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: null,
			response: {
				allowed: true,
				customer_id: "cus_123",
				required_balance: 1,
			},
		});
	});

	test("returns fail-open fallback when the v2 flow hits a redis command timeout", async () => {
		mockState.legacyCalls = [];
		mockState.v2Calls = [];
		mockState.v2Error = new Error("Command timed out");
		mockState.warnCalls = [];

		const result = await runCheckWithRollout({
			ctx: {
				apiVersion: { value: "2025-02-01" },
				features: [],
				logger: {
					warn: (...args: unknown[]) => mockState.warnCalls.push(args),
				},
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 10,
				},
			} as never,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: null,
			response: {
				allowed: true,
				customer_id: "cus_123",
				required_balance: 1,
			},
		});
	});
});
