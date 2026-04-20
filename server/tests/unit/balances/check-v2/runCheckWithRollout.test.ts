import { describe, expect, mock, test } from "bun:test";

const mockState = {
	legacyCalls: [] as Record<string, unknown>[],
	v2Calls: [] as Record<string, unknown>[],
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
});
