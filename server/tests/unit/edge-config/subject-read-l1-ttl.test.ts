import { afterEach, describe, expect, test } from "bun:test";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	getSubjectReadL1TtlMs,
	isSubjectReadSingleflightEnabled,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setSubjectReadL1TtlMs = (subjectReadL1TtlMs: number) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, subjectReadL1TtlMs },
	});
};

const setSubjectReadSingleflight = (subjectReadSingleflight: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, subjectReadSingleflight },
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

describe("subject read singleflight edge config", () => {
	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("defaults to true", () => {
		expect(defaultConfig.subjectReadSingleflight).toBe(true);
		expect(isSubjectReadSingleflightEnabled()).toBe(true);
	});

	test("reads the runtime value", () => {
		setSubjectReadSingleflight(true);

		expect(isSubjectReadSingleflightEnabled()).toBe(true);
	});

	test("false disables singleflight", () => {
		setSubjectReadSingleflight(false);

		expect(isSubjectReadSingleflightEnabled()).toBe(false);
	});
});
