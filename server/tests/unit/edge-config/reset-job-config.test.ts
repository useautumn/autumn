import { afterEach, describe, expect, test } from "bun:test";
import { ResetJobConfigSchema } from "@/internal/misc/resetJob/resetJobSchemas.js";
import {
	getResetJobConfig,
	isResetJobEnabled,
	setResetJobConfigForTesting,
} from "@/internal/misc/resetJob/resetJobStore.js";

describe("reset job config", () => {
	afterEach(() => {
		setResetJobConfigForTesting({
			config: { enabled: false, batchSize: 500 },
		});
	});

	test("defaults to disabled", () => {
		expect(ResetJobConfigSchema.parse({})).toEqual({
			enabled: false,
			batchSize: 500,
		});
		expect(isResetJobEnabled()).toBe(false);
	});

	test("updates the job at runtime", () => {
		setResetJobConfigForTesting({
			config: { enabled: true, batchSize: 1_000 },
		});
		expect(isResetJobEnabled()).toBe(true);
		expect(getResetJobConfig().batchSize).toBe(1_000);
	});

	test("bounds the batch size", () => {
		expect(() =>
			ResetJobConfigSchema.parse({ enabled: true, batchSize: 0 }),
		).toThrow();
		expect(() =>
			ResetJobConfigSchema.parse({ enabled: true, batchSize: 2_001 }),
		).toThrow();
	});
});
