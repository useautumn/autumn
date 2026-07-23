import { afterEach, describe, expect, test } from "bun:test";
import { ResetJobConfigSchema } from "@/internal/misc/resetJob/resetJobSchemas.js";
import {
	isResetJobEnabled,
	setResetJobConfigForTesting,
} from "@/internal/misc/resetJob/resetJobStore.js";

describe("reset job config", () => {
	afterEach(() => {
		setResetJobConfigForTesting({ config: { enabled: false } });
	});

	test("defaults to disabled", () => {
		expect(ResetJobConfigSchema.parse({})).toEqual({ enabled: false });
		expect(isResetJobEnabled()).toBe(false);
	});

	test("enables the job at runtime", () => {
		setResetJobConfigForTesting({ config: { enabled: true } });
		expect(isResetJobEnabled()).toBe(true);
	});
});
