import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockState = {
	warnings: [] as Array<{ message: string; data?: Record<string, unknown> }>,
};
const defaultRedis = { status: "ready" };

mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info: () => undefined,
		warn: (data: Record<string, unknown> | string, message?: string) => {
			if (typeof data === "string") {
				mockState.warnings.push({ message: data });
				return;
			}

			mockState.warnings.push({
				message: message || "",
				data,
			});
		},
	},
}));

mock.module("@/external/redis/initUtils/redisConfig.js", () => ({
	hasRedisConfig: true,
}));
mock.module("@/external/redis/initUtils/redisClientRegistry.js", () => ({
	redis: defaultRedis,
}));
mock.module("@/external/redis/initRedis.js", () => ({
	redis: defaultRedis,
}));

import {
	getRedisAvailability,
	markRedisCommandFailure,
	markRedisCommandSuccess,
} from "@/external/redis/initUtils/redisAvailability.js";
import {
	tryRedisNx,
	tryRedisRead,
	tryRedisWrite,
} from "@/utils/cacheUtils/cacheUtils.js";

describe("cache utils", () => {
	beforeEach(() => {
		mockState.warnings = [];
	});

	test("redis availability uses recovery and degradation thresholds", () => {
		markRedisCommandFailure();
		markRedisCommandFailure();
		markRedisCommandFailure();
		expect(getRedisAvailability().state).toBe("degraded");

		markRedisCommandSuccess();
		expect(getRedisAvailability().state).toBe("degraded");

		markRedisCommandSuccess();
		expect(getRedisAvailability().state).toBe("healthy");

		markRedisCommandFailure();
		markRedisCommandFailure();
		expect(getRedisAvailability().state).toBe("healthy");

		markRedisCommandFailure();
		expect(getRedisAvailability().state).toBe("degraded");
	});

	test("tryRedisRead returns null and warns when Redis operation throws", async () => {
		const result = await tryRedisRead(
			async () => {
				throw new Error("boom");
			},
			{ status: "ready" } as never,
		);

		expect(result).toBeNull();
		expect(mockState.warnings).toHaveLength(1);
		expect(mockState.warnings[0]).toEqual({
			message: "[redis] operation unavailable",
			data: {
				source: "tryRedisRead:error",
				error: "boom",
			},
		});
	});

	test("tryRedisWrite returns null and warns when Redis is not ready", async () => {
		const result = await tryRedisWrite(async () => "OK", {
			status: "connecting",
		} as never);

		expect(result).toBeNull();
		expect(mockState.warnings).toHaveLength(1);
		expect(mockState.warnings[0]).toEqual({
			message: "[redis] operation unavailable",
			data: {
				source: "tryRedisWrite:not-ready",
				error: undefined,
			},
		});
	});

	test("tryRedisNx falls back and warns when Redis operation throws", async () => {
		const result = await tryRedisNx({
			operation: async () => {
				throw new Error("boom");
			},
			redisInstance: { status: "ready" } as never,
			onRedisUnavailable: () => "fallback",
			onSuccess: () => "success",
			onKeyAlreadyExists: () => "exists",
		});

		expect(result).toBe("fallback");
		expect(mockState.warnings).toHaveLength(1);
		expect(mockState.warnings[0]).toEqual({
			message: "[redis] operation unavailable",
			data: {
				source: "tryRedisNx:error",
				error: "boom",
			},
		});
	});

	test("custom Redis failures do not mark default Redis unavailable", async () => {
		markRedisCommandSuccess();
		markRedisCommandSuccess();
		expect(getRedisAvailability().state).toBe("healthy");

		await tryRedisRead(
			async () => {
				throw new Error("custom redis failed");
			},
			{ status: "ready" } as never,
		);

		expect(getRedisAvailability().state).toBe("healthy");
	});
});
