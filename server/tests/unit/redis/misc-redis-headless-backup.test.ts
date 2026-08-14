import { afterEach, describe, expect, test } from "bun:test";
import { getMiscBackupRedis } from "@/external/redis/miscCache/miscRedisInstances.js";
import { _setMiscRedisConfigForTesting } from "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";

describe("getMiscBackupRedis headless isolation", () => {
	afterEach(() => {
		delete process.env.DW_HEADLESS;
		_setMiscRedisConfigForTesting({});
	});

	test("returns null when DW_HEADLESS=1 even if edge-config has a backup", () => {
		process.env.DW_HEADLESS = "1";
		_setMiscRedisConfigForTesting({
			backup: {
				publicConnectionString: "encrypted-would-open-dragonfly-cloud",
				privateConnectionString: null,
				url: "example.dragonflydb.cloud:6385",
			},
		});
		expect(getMiscBackupRedis()).toBeNull();
	});

	test("returns null when DW_HEADLESS=true", () => {
		process.env.DW_HEADLESS = "true";
		_setMiscRedisConfigForTesting({
			backup: {
				publicConnectionString: "encrypted-would-open-dragonfly-cloud",
				privateConnectionString: null,
				url: "example.dragonflydb.cloud:6385",
			},
		});
		expect(getMiscBackupRedis()).toBeNull();
	});
});
