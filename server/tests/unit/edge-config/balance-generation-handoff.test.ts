import { afterEach, describe, expect, test } from "bun:test";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import {
	_setMiscellaneousEdgeConfigForTesting,
	isBalanceGenerationHandoffEnabled,
} from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});

describe("balance-generation handoff edge config", () => {
	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("defaults to false", () => {
		expect(defaultConfig.balanceGenerationHandoff).toBe(false);
		expect(isBalanceGenerationHandoffEnabled()).toBe(false);
	});

	test("reads the enabled runtime value", () => {
		_setMiscellaneousEdgeConfigForTesting({
			config: { ...defaultConfig, balanceGenerationHandoff: true },
		});

		expect(isBalanceGenerationHandoffEnabled()).toBe(true);
	});
});
