import { afterEach, describe, expect, test } from "bun:test";
import { ResetJobV2ConfigSchema } from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Schemas.js";
import {
	getResetJobV2Config,
	setResetJobV2ConfigForTesting,
} from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Store.js";

const defaultConfig = ResetJobV2ConfigSchema.parse({});

describe("reset job V2 config", () => {
	afterEach(() => {
		setResetJobV2ConfigForTesting({ config: defaultConfig });
	});

	test("defaults to three concurrent reset jobs", () => {
		expect(defaultConfig.maxConcurrentJobs).toBe(3);
	});

	test("applies the concurrency limit at runtime", () => {
		setResetJobV2ConfigForTesting({
			config: { ...defaultConfig, maxConcurrentJobs: 7 },
		});

		expect(getResetJobV2Config().maxConcurrentJobs).toBe(7);
	});

	test("bounds concurrent reset jobs", () => {
		expect(() =>
			ResetJobV2ConfigSchema.parse({ maxConcurrentJobs: 0 }),
		).toThrow();
		expect(() =>
			ResetJobV2ConfigSchema.parse({ maxConcurrentJobs: 101 }),
		).toThrow();
	});
});
