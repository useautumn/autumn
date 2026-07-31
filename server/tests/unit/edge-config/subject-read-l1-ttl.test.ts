import { afterEach, describe, expect, test } from "bun:test";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	getSubjectReadL1TtlMs,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setSubjectReadL1TtlMs = (subjectReadL1TtlMs: number) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, subjectReadL1TtlMs },
	});
};

describe("subject read L1 TTL edge config", () => {
	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("defaults to 1000ms", () => {
		expect(defaultConfig.subjectReadL1TtlMs).toBe(1000);
		expect(getSubjectReadL1TtlMs()).toBe(1000);
	});

	test("reads the runtime value", () => {
		setSubjectReadL1TtlMs(250);

		expect(getSubjectReadL1TtlMs()).toBe(250);
	});

	test("0 acts as the kill switch value", () => {
		setSubjectReadL1TtlMs(0);

		expect(getSubjectReadL1TtlMs()).toBe(0);
	});
});
