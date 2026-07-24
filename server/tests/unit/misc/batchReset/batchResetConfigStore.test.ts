import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

// Capture the real module BEFORE mocking; restored in afterAll (module mocks
// leak across test files — mock.restore does not undo them).
const realEdgeConfigRegistry = {
	...(await import("@/internal/misc/edgeConfig/edgeConfigRegistry.js")),
};

mock.module("@/internal/misc/edgeConfig/edgeConfigRegistry.js", () => ({
	registerEdgeConfig: () => undefined,
}));

import { BatchResetConfigSchema } from "@/internal/misc/batchReset/batchResetConfigSchemas.js";
import {
	_setBatchResetConfigForTesting,
	isBatchResetEnabled,
} from "@/internal/misc/batchReset/batchResetConfigStore.js";

const reset = () => {
	_setBatchResetConfigForTesting({ config: { enabled: true } });
};

describe("isBatchResetEnabled", () => {
	afterEach(reset);

	test("defaults to enabled when the S3 config is absent", () => {
		expect(BatchResetConfigSchema.parse({})).toEqual({ enabled: true });
	});

	test("returns true when batch resets are enabled", () => {
		reset();

		expect(isBatchResetEnabled()).toBe(true);
	});

	test("returns false when batch resets are disabled", () => {
		_setBatchResetConfigForTesting({ config: { enabled: false } });

		expect(isBatchResetEnabled()).toBe(false);
	});
});

afterAll(() => {
	mock.module(
		"@/internal/misc/edgeConfig/edgeConfigRegistry.js",
		() => realEdgeConfigRegistry,
	);
	mock.restore();
});
