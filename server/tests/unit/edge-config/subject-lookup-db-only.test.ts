import { afterEach, describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applySubjectLookupDbOnly } from "@/internal/misc/miscellaneousEdgeConfig/applySubjectLookupDbOnly.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	isSubjectLookupDbOnlyEnabled,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

const setSubjectLookupDbOnly = (subjectLookupDbOnly: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, subjectLookupDbOnly },
	});
};

describe("subject lookup db-only edge config", () => {
	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("defaults to off", () => {
		expect(defaultConfig.subjectLookupDbOnly).toBe(false);
		expect(isSubjectLookupDbOnlyEnabled()).toBe(false);
	});

	test("reads the runtime flag", () => {
		setSubjectLookupDbOnly(true);

		expect(isSubjectLookupDbOnlyEnabled()).toBe(true);
	});

	test("forces skipCache on the context when enabled", () => {
		setSubjectLookupDbOnly(true);
		const ctx = { skipCache: false } as AutumnContext;

		applySubjectLookupDbOnly({ ctx });

		expect(ctx.skipCache).toBe(true);
	});

	test("leaves the context untouched when disabled", () => {
		setSubjectLookupDbOnly(false);
		const ctx = { skipCache: false } as AutumnContext;

		applySubjectLookupDbOnly({ ctx });

		expect(ctx.skipCache).toBe(false);
	});

	test("never re-enables the cache for a request that already opted out", () => {
		setSubjectLookupDbOnly(false);
		const ctx = { skipCache: true } as AutumnContext;

		applySubjectLookupDbOnly({ ctx });

		expect(ctx.skipCache).toBe(true);
	});
});
