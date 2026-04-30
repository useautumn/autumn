import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockState = {
	shouldUseRedis: false,
	warnings: [] as string[],
};

mock.module("@/external/redis/initRedis", () => ({
	redis: {},
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

// Stub logger must match the full `Logger` shape from logtailUtils.ts because
// `mock.module` is process-wide in Bun: any other unit test loaded later in the
// same `bun test` run gets this stub instead of the real logger. Missing
// methods (e.g. `debug`) would crash unrelated code paths.
const mockLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: (message: string) => {
		mockState.warnings.push(message);
	},
	error: () => undefined,
	child: () => mockLogger,
};

mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: mockLogger,
}));

import { rateLimitFactory } from "@/internal/misc/rateLimiter/rateLimitFactory.js";

describe("rateLimitFactory", () => {
	beforeEach(() => {
		mockState.shouldUseRedis = false;
		mockState.warnings = [];
	});

	test("fails open and warns when Redis is unavailable", async () => {
		let nextCalls = 0;
		const middleware = rateLimitFactory({
			limit: 5,
			windowMs: 1000,
			notInRedis: false,
		});

		await middleware({} as never, async () => {
			nextCalls++;
		});

		expect(nextCalls).toBe(1);
		expect(mockState.warnings).toEqual([
			"[rate-limit] Redis unavailable; bypassing distributed rate limiting",
		]);
	});
});
