import { afterEach, describe, expect, test } from "bun:test";
import { bindStagingVariants, variant } from "@autumn/edge-config";
import {
	ADAPTIVE_LINGER_EXPERIMENT,
	adaptiveLingerArm,
	forceAdaptiveLingerArm,
	forcedAdaptiveLingerArmFromEnv,
	skipsIdleLinger,
} from "../../../src/experiments/adaptiveLinger.js";

const config = (arms: string[]) => ({
	experiments: { [ADAPTIVE_LINGER_EXPERIMENT]: { arms } },
	updatedAt: new Date().toISOString(),
});

afterEach(() => {
	forceAdaptiveLingerArm({ arm: undefined });
	bindStagingVariants({
		read: () => config([]),
		identity: "none",
		bucket: "autumn-prod-server",
	});
	delete process.env.BALANCE_WORKER_ADAPTIVE_LINGER_ARM;
});

describe("adaptive-linger", () => {
	test("A lingers as today; B skips the wait only while nothing is on the wire", () => {
		forceAdaptiveLingerArm({ arm: "A" });
		expect(skipsIdleLinger({ inFlight: 0 })).toBe(false);
		expect(skipsIdleLinger({ inFlight: 1 })).toBe(false);
		forceAdaptiveLingerArm({ arm: "B" });
		expect(skipsIdleLinger({ inFlight: 0 })).toBe(true);
		expect(skipsIdleLinger({ inFlight: 1 })).toBe(false);
	});

	test("unforced, the arm follows the window and is A outside the staging bucket", () => {
		let now = 0;
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-staging",
			now: () => now,
		});
		const seen = new Set<string>();
		for (let window = 0; window < 40; window++) {
			now = window * 10_000;
			const arm = variant(ADAPTIVE_LINGER_EXPERIMENT);
			seen.add(arm);
			expect(adaptiveLingerArm()).toBe(arm);
		}
		expect([...seen].sort()).toEqual(["A", "B"]);
		bindStagingVariants({
			read: () => config(["A", "B"]),
			identity: "task-1",
			bucket: "autumn-prod-server",
		});
		expect(adaptiveLingerArm()).toBe("A");
	});

	test("the environment forces an arm outside production only", () => {
		process.env.BALANCE_WORKER_ADAPTIVE_LINGER_ARM = "B";
		expect(forcedAdaptiveLingerArmFromEnv()).toBe("B");
		process.env.BALANCE_WORKER_ADAPTIVE_LINGER_ARM = "C";
		expect(forcedAdaptiveLingerArmFromEnv()).toBeUndefined();
	});
});
