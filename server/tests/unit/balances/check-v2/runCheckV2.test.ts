import { describe, expect, mock, test } from "bun:test";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";

const mockState = {
	getCheckDataCalls: [] as unknown[],
	getCheckResponseCalls: [] as unknown[],
	runCheckWithTrackCalls: [] as unknown[],
	getCheckDataError: null as unknown,
	runCheckWithTrackError: null as unknown,
};

mock.module("@/internal/balances/check/getCheckDataV2.js", () => ({
	getCheckDataV2: async (args: unknown) => {
		mockState.getCheckDataCalls.push(args);
		if (mockState.getCheckDataError) throw mockState.getCheckDataError;
		return { source: "v2" };
	},
}));

mock.module("@/internal/balances/check/getCheckResponseV2.js", () => ({
	getCheckResponseV2: async (args: unknown) => {
		mockState.getCheckResponseCalls.push(args);
		return { allowed: true, source: "v2" };
	},
}));

mock.module("@/internal/balances/check/runCheckWithTrackV2.js", () => ({
	runCheckWithTrackV2: async (args: unknown) => {
		mockState.runCheckWithTrackCalls.push(args);
		if (mockState.runCheckWithTrackError) throw mockState.runCheckWithTrackError;
		return { allowed: true, source: "track" };
	},
}));

import { runCheckV2 } from "@/internal/balances/check/runCheckV2.js";

describe("runCheckV2", () => {
	test("returns check data and response", async () => {
		mockState.getCheckDataCalls = [];
		mockState.getCheckResponseCalls = [];
		mockState.runCheckWithTrackCalls = [];
		mockState.getCheckDataError = null;
		mockState.runCheckWithTrackError = null;

		const result = await runCheckV2({
			ctx: {} as never,
			body: { feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: { source: "v2" },
			response: { allowed: true, source: "v2" },
		});
	});

	test("rethrows RedisUnavailableError from getCheckDataV2 before later phases", async () => {
		mockState.getCheckDataCalls = [];
		mockState.getCheckResponseCalls = [];
		mockState.runCheckWithTrackCalls = [];
		mockState.getCheckDataError = new RedisUnavailableError({
			source: "getCheckDataV2",
			reason: "timeout",
		});
		mockState.runCheckWithTrackError = null;

		await expect(
			runCheckV2({
				ctx: {} as never,
				body: { feature_id: "messages" } as never,
				requiredBalance: 1,
			}),
		).rejects.toBe(mockState.getCheckDataError);

		expect(mockState.getCheckDataCalls).toHaveLength(1);
		expect(mockState.getCheckResponseCalls).toHaveLength(0);
		expect(mockState.runCheckWithTrackCalls).toHaveLength(0);
	});

	test("rethrows RedisUnavailableError from track-backed check before building a normal response", async () => {
		mockState.getCheckDataCalls = [];
		mockState.getCheckResponseCalls = [];
		mockState.runCheckWithTrackCalls = [];
		mockState.getCheckDataError = null;
		mockState.runCheckWithTrackError = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "timeout",
		});

		await expect(
			runCheckV2({
				ctx: {} as never,
				body: {
					feature_id: "messages",
					send_event: true,
				} as never,
				requiredBalance: 1,
			}),
		).rejects.toBe(mockState.runCheckWithTrackError);

		expect(mockState.getCheckDataCalls).toHaveLength(1);
		expect(mockState.runCheckWithTrackCalls).toHaveLength(1);
		expect(mockState.getCheckResponseCalls).toHaveLength(0);
	});
});
