import { afterEach, describe, expect, test } from "bun:test";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	isSubjectReadSingleflightEnabled,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setSubjectReadSingleflight = (subjectReadSingleflight: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, subjectReadSingleflight },
	});
};

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
