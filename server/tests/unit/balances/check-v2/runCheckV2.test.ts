import { describe, expect, mock, test } from "bun:test";

const mockState = {
	getCheckDataCalls: [] as unknown[],
};

mock.module("@/internal/balances/check/getCheckDataV2.js", () => ({
	getCheckDataV2: async (args: unknown) => {
		mockState.getCheckDataCalls.push(args);
		return { source: "v2" };
	},
}));

mock.module("@/internal/balances/check/getCheckResponseV2.js", () => ({
	getCheckResponseV2: async () => ({ allowed: true, source: "v2" }),
}));

import { runCheckV2 } from "@/internal/balances/check/runCheckV2.js";

describe("runCheckV2", () => {
	test("returns check data and response", async () => {
		mockState.getCheckDataCalls = [];

		const result = await runCheckV2({
			ctx: {} as never,
			body: { feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: { source: "v2" },
			response: { allowed: true, source: "v2" },
		});
		expect(mockState.getCheckDataCalls).toHaveLength(1);
	});
});
