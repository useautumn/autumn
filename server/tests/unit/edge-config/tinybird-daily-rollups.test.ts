import { afterEach, expect, test } from "bun:test";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	isTinybirdDailyRollupsEnabled,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

afterEach(() => {
	_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
});

test("tinybird daily rollups: remain dark until explicitly enabled", () => {
	expect(defaultConfig.tinybirdDailyRollups).toBe(false);
	_setMiscellaneousEdgeConfigForTesting({
		config: { ...defaultConfig, tinybirdDailyRollups: true },
	});
	expect(isTinybirdDailyRollupsEnabled()).toBe(true);
});
