import { afterEach, describe, expect, test } from "bun:test";
import { BASELINE_ENGINE_DIET, engineDiet } from "@autumn/balance-engine";
import { bindStagingVariants, variant } from "@autumn/edge-config";
import {
	bindEngineAllocExperiment,
	ENGINE_ALLOC_EXPERIMENT,
	engineDietForArm,
	forcedEngineAllocArmFromEnv,
} from "../../../src/experiments/engineAlloc.js";

const config = (arms: string[]) => ({
	experiments: { [ENGINE_ALLOC_EXPERIMENT]: { arms } },
	updatedAt: new Date().toISOString(),
});

afterEach(() => {
	bindStagingVariants({
		read: () => config([]),
		identity: "none",
		bucket: "autumn-prod-server",
	});
	bindEngineAllocExperiment({ force: "A" });
	delete process.env.BALANCE_WORKER_ENGINE_ALLOC_ARM;
});

describe("engine-alloc experiment", () => {
	test("A is the engine as it is; B turns on exactly the three churn cuts", () => {
		expect(engineDietForArm({ arm: "A" })).toBe(BASELINE_ENGINE_DIET);
		expect(engineDietForArm({ arm: "B" })).toEqual({
			rowChanges: true,
			requestOnce: true,
			advanceContext: true,
		});
		expect(engineDietForArm({ arm: "C" })).toBe(BASELINE_ENGINE_DIET);
	});

	test("the engine follows the window's arm and both arms occur", () => {
		let now = 0;
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-staging",
			now: () => now,
		});
		bindEngineAllocExperiment();
		const seen = new Set<string>();
		for (let window = 0; window < 40; window++) {
			now = window * 10_000;
			const arm = variant(ENGINE_ALLOC_EXPERIMENT);
			seen.add(arm);
			expect(engineDiet()).toBe(engineDietForArm({ arm }));
		}
		expect([...seen].sort()).toEqual(["A", "B"]);
	});

	test("outside the staging bucket, or unbound, the engine runs its baseline paths", () => {
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-prod-server",
		});
		bindEngineAllocExperiment();
		expect(engineDiet()).toBe(BASELINE_ENGINE_DIET);
	});

	test("a forced arm wins, and the environment only forces it outside production", () => {
		bindEngineAllocExperiment({ force: "B" });
		expect(engineDiet().rowChanges).toBe(true);
		process.env.BALANCE_WORKER_ENGINE_ALLOC_ARM = "B";
		expect(forcedEngineAllocArmFromEnv()).toBe("B");
		process.env.BALANCE_WORKER_ENGINE_ALLOC_ARM = "C";
		expect(forcedEngineAllocArmFromEnv()).toBeUndefined();
	});
});
